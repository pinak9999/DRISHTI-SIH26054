"""Automated tests for Physics-Informed Reference Engine and Residual Calculator."""

from __future__ import annotations

from backend.app.physics.engine_model import (
    AeroPistonReferenceModel,
    PHYSICS_MODEL_VERSION,
)
from backend.app.telemetry.schema import TelemetryInputFrame
from backend.app.telemetry.validator import TelemetryValidator


def _make_validated(
    validator: TelemetryValidator,
    seq: int = 0,
    rpm: float = 5000.0,
    load_pct: float = 75.0,
    altitude_m: float = 2800.0,
    ambient_c: float = 15.0,
    cht_c: float = 178.0,
    egt_c: float = 815.0,
    oil_p: float = 4.2,
    oil_t: float = 99.0,
    vib: float = 2.3,
):
    raw = TelemetryInputFrame(
        engine_id="ENG-PHYS-01",
        mission_id="MSN-PHYS-01",
        timestamp=f"2026-10-03T06:00:{seq % 60:02d}Z",
        sequence_number=seq,
        mission_elapsed_sec=float(seq),
        rpm=rpm,
        cht_c=cht_c,
        egt_c=egt_c,
        oil_pressure_bar=oil_p,
        oil_temp_c=oil_t,
        fuel_flow_lph=22.0,
        vibration_rms_mms=vib,
        throttle_pct=load_pct * 0.96,
        engine_load_pct=load_pct,
        altitude_m=altitude_m,
        ambient_temp_c=ambient_c,
    )
    return validator.validate_frame(raw)


def test_physics_expected_relationships_and_metadata() -> None:
    model = AeroPistonReferenceModel()
    validator = TelemetryValidator()

    meta = model.get_model_metadata()
    assert meta["model_version"] == PHYSICS_MODEL_VERSION
    assert "supported_operating_envelope" in meta
    assert len(meta["assumptions"]) >= 4

    # Low load vs High load -> higher expected CHT, EGT, Fuel Flow, and Vibration
    v_low = _make_validated(validator, seq=0, rpm=4200.0, load_pct=50.0)
    v_high = _make_validated(validator, seq=1, rpm=5400.0, load_pct=90.0)

    exp_low = model.estimate_expected(v_low)
    exp_high = model.estimate_expected(v_high)

    assert exp_high.cht_c > exp_low.cht_c
    assert exp_high.egt_c > exp_low.egt_c
    assert exp_high.fuel_flow_lph > exp_low.fuel_flow_lph
    assert exp_high.vibration_rms_mms > exp_low.vibration_rms_mms
    assert exp_low.is_extrapolated is False

    # High altitude -> reduced air density ratio and reduced cooling effectiveness -> higher expected CHT
    v_sea = _make_validated(validator, seq=2, altitude_m=200.0, ambient_c=15.0)
    v_alt = _make_validated(validator, seq=3, altitude_m=6200.0, ambient_c=15.0)

    exp_sea = model.estimate_expected(v_sea)
    exp_alt = model.estimate_expected(v_alt)
    assert exp_alt.air_density_ratio < exp_sea.air_density_ratio
    assert exp_alt.cooling_effectiveness < exp_sea.cooling_effectiveness
    assert exp_alt.cht_c > exp_sea.cht_c


def test_physics_extrapolation_detection_and_residuals() -> None:
    model = AeroPistonReferenceModel()
    validator = TelemetryValidator()

    # Out of supported operating envelope (Altitude 7800m > 7000m max, RPM 6300 > 6000 max)
    v_extrap = _make_validated(validator, seq=0, rpm=6300.0, altitude_m=7800.0)
    exp_extrap = model.estimate_expected(v_extrap)
    assert exp_extrap.is_extrapolated is True
    assert exp_extrap.is_valid is False
    assert len(exp_extrap.extrapolation_reasons) >= 2

    # Verify residual calculation and positive CHT slope tracking
    model.reset_engine_state("ENG-PHYS-01", "MSN-PHYS-01")
    validator.reset_stream("ENG-PHYS-01", "MSN-PHYS-01")

    for s in range(6):
        vf = _make_validated(validator, seq=s, cht_c=180.0 + 4.0 * s)
        exp = model.estimate_expected(vf)
        calc = model.calculate_residuals_and_trends(vf, exp)

    assert calc.cht_rolling_slope_c_per_s > 3.5
    assert abs(calc.cht_residual_c - (vf.cht_c - exp.cht_c)) < 0.05
