"""Automated tests for telemetry contract, validator, CAN codec, and CSV parser."""

from __future__ import annotations

from backend.app.telemetry.can_adapter import (
    ModularSocketCANAdapter,
    parse_csv_telemetry,
)
from backend.app.telemetry.schema import (
    DataSourceType,
    NINE_FAULT_CLASSES,
    TELEMETRY_SCHEMA_VERSION,
    TELEMETRY_UNITS,
    TelemetryInputFrame,
)
from backend.app.telemetry.validator import TelemetryValidator


def test_schema_version_and_nine_classes() -> None:
    assert TELEMETRY_SCHEMA_VERSION == "1.0.0"
    assert len(NINE_FAULT_CLASSES) == 9
    assert "Normal" in NINE_FAULT_CLASSES
    assert "Sensor Fault" in NINE_FAULT_CLASSES
    assert "Fuel Injector Clogging" in NINE_FAULT_CLASSES
    assert TELEMETRY_UNITS["cht_c"] == "degC"
    assert TELEMETRY_UNITS["oil_pressure_bar"] == "bar"


def test_validator_nominal_and_missing_duplicate_stale_out_of_order() -> None:
    validator = TelemetryValidator(max_stale_seconds=10.0)

    # 1. Nominal frame
    f0 = TelemetryInputFrame(
        engine_id="ENG-T01",
        mission_id="MSN-T01",
        timestamp="2026-10-03T06:00:00Z",
        sequence_number=0,
        mission_elapsed_sec=0.0,
        rpm=5000.0,
        cht_c=178.0,
        egt_c=815.0,
        oil_pressure_bar=4.2,
        oil_temp_c=99.0,
        fuel_flow_lph=22.0,
        vibration_rms_mms=2.3,
        throttle_pct=74.0,
        engine_load_pct=76.0,
        altitude_m=3000.0,
        ambient_temp_c=14.0,
    )
    v0 = validator.validate_frame(f0)
    assert v0.quality.is_valid is True
    assert v0.quality.quality_score == 1.0
    assert len(v0.quality.missing_fields) == 0

    # 2. Duplicate sequence number and timestamp
    v_dup = validator.validate_frame(f0)
    assert v_dup.quality.is_duplicate is True
    assert v_dup.quality.is_valid is False

    # 3. Missing channel imputation and stale timestamp gap (25 seconds > 10s threshold)
    f_stale_missing = TelemetryInputFrame(
        engine_id="ENG-T01",
        mission_id="MSN-T01",
        timestamp="2026-10-03T06:00:25Z",
        sequence_number=1,
        mission_elapsed_sec=25.0,
        rpm=5050.0,
        cht_c=None,  # Missing CHT
        egt_c=820.0,
        oil_pressure_bar=4.1,
        oil_temp_c=100.0,
        fuel_flow_lph=22.4,
        vibration_rms_mms=2.4,
        throttle_pct=75.0,
        engine_load_pct=77.0,
        altitude_m=3010.0,
        ambient_temp_c=14.0,
    )
    v_stale = validator.validate_frame(f_stale_missing)
    assert v_stale.quality.is_stale is True
    assert "cht_c" in v_stale.quality.missing_fields
    assert "cht_c" in v_stale.quality.imputed_fields
    assert v_stale.cht_c == 178.0  # Imputed from previous valid frame

    # 4. Out-of-order timestamp / sequence
    f_ooo = TelemetryInputFrame(
        engine_id="ENG-T01",
        mission_id="MSN-T01",
        timestamp="2026-10-03T06:00:12Z",
        sequence_number=0,
        mission_elapsed_sec=12.0,
        rpm=5000.0,
        cht_c=180.0,
        egt_c=815.0,
        oil_pressure_bar=4.2,
        oil_temp_c=99.0,
        fuel_flow_lph=22.0,
        vibration_rms_mms=2.3,
        throttle_pct=74.0,
        engine_load_pct=76.0,
        altitude_m=3000.0,
        ambient_temp_c=14.0,
    )
    v_ooo = validator.validate_frame(f_ooo)
    assert v_ooo.quality.is_out_of_order is True
    assert v_ooo.quality.is_valid is False

    # 5. Implausible sensor value outside physical bounds
    f_implausible = TelemetryInputFrame(
        engine_id="ENG-T01",
        mission_id="MSN-T01",
        timestamp="2026-10-03T06:00:30Z",
        sequence_number=2,
        mission_elapsed_sec=30.0,
        rpm=5000.0,
        cht_c=490.0,  # Exceeds 350 degC max plausible sensor bound
        egt_c=815.0,
        oil_pressure_bar=4.2,
        oil_temp_c=99.0,
        fuel_flow_lph=22.0,
        vibration_rms_mms=2.3,
        throttle_pct=74.0,
        engine_load_pct=76.0,
        altitude_m=3000.0,
        ambient_temp_c=14.0,
    )
    v_imp = validator.validate_frame(f_implausible)
    assert "cht_c" in v_imp.quality.invalid_sensor_channels
    assert v_imp.quality.is_valid is False

    stats = validator.get_rejection_stats()
    assert stats["total_received"] == 5
    assert stats["total_valid"] == 1
    assert stats["duplicate_count"] >= 1
    assert stats["out_of_order_count"] >= 1
    assert stats["stale_count"] == 1


def test_can_adapter_roundtrip_and_status() -> None:
    adapter = ModularSocketCANAdapter()
    status = adapter.get_interface_status()
    assert status["hardware_connected"] is False
    assert status["mode"] == "SOFTWARE_CODEC_READY_NO_HARDWARE"

    orig = TelemetryInputFrame(
        engine_id="ENG-CAN-01",
        mission_id="MSN-CAN-01",
        timestamp="2026-10-03T06:00:00Z",
        sequence_number=7,
        mission_elapsed_sec=7.0,
        rpm=5120.0,
        cht_c=182.4,
        egt_c=825.6,
        oil_pressure_bar=4.15,
        oil_temp_c=101.2,
        fuel_flow_lph=23.45,
        vibration_rms_mms=2.48,
        throttle_pct=76.5,
        engine_load_pct=78.2,
        altitude_m=3450.0,
        ambient_temp_c=9.5,
        battery_voltage_v=13.85,
        alternator_current_a=19.2,
        injection_pulse_ms=8.65,
        ignition_advance_deg=26.4,
    )
    frames = adapter.encode_telemetry_to_can_bundle(orig)
    decoded = adapter.decode_can_bundle_to_telemetry(
        engine_id="ENG-CAN-01",
        mission_id="MSN-CAN-01",
        timestamp="2026-10-03T06:00:00Z",
        sequence_number=7,
        mission_elapsed_sec=7.0,
        frames=frames,
    )
    assert decoded.data_source == DataSourceType.CAN_SIMULATED_ADAPTER
    assert abs((decoded.rpm or 0.0) - 5120.0) < 1.0
    assert abs((decoded.cht_c or 0.0) - 182.4) < 0.2
    assert abs((decoded.oil_pressure_bar or 0.0) - 4.15) < 0.02


def test_csv_telemetry_parser() -> None:
    csv_payload = """sequence_number,mission_elapsed_sec,timestamp,rpm,cht_c,egt_c,oil_pressure_bar,oil_temp_c,fuel_flow_lph,vibration_rms_mms,throttle_pct,engine_load_pct,altitude_m,ambient_temp_c
0,0.0,2026-10-03T06:00:00Z,4950,176.2,810.5,4.18,98.4,21.8,2.21,73.0,75.0,2800,15.0
1,1.0,2026-10-03T06:00:01Z,4980,177.0,812.0,4.16,98.7,22.0,2.24,73.5,75.5,2805,14.9
"""
    frames = parse_csv_telemetry(csv_payload, default_engine_id="ENG-CSV", default_mission_id="MSN-CSV")
    assert len(frames) == 2
    assert frames[0].data_source == DataSourceType.CSV_REPLAY
    assert frames[1].rpm == 4980.0
