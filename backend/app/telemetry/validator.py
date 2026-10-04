"""Telemetry stream validation, imputation, ordering, and quality metrics."""

from __future__ import annotations

from datetime import datetime
import math
from typing import Dict, List, Optional, Tuple

from backend.app.telemetry.schema import (
    DataQualityMetadata,
    SENSOR_PLAUSIBLE_BOUNDS,
    TELEMETRY_UNITS,
    TelemetryInputFrame,
    ValidatedTelemetryFrame,
)

NOMINAL_CHANNEL_DEFAULTS: Dict[str, float] = {
    "rpm": 4900.0,
    "cht_c": 175.0,
    "egt_c": 805.0,
    "oil_pressure_bar": 4.1,
    "oil_temp_c": 98.0,
    "fuel_flow_lph": 21.5,
    "vibration_rms_mms": 2.2,
    "throttle_pct": 72.0,
    "engine_load_pct": 74.0,
    "altitude_m": 2500.0,
    "ambient_temp_c": 12.0,
    "battery_voltage_v": 13.8,
    "alternator_current_a": 18.0,
    "injection_pulse_ms": 8.2,
    "ignition_advance_deg": 26.0,
}

REQUIRED_CORE_CHANNELS: List[str] = [
    "rpm",
    "cht_c",
    "egt_c",
    "oil_pressure_bar",
    "oil_temp_c",
    "fuel_flow_lph",
    "vibration_rms_mms",
    "throttle_pct",
    "engine_load_pct",
    "altitude_m",
    "ambient_temp_c",
]


def _parse_iso_timestamp(ts: str) -> Optional[datetime]:
    try:
        cleaned = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned)
    except Exception:
        return None


class TelemetryValidator:
    """Stateful validator per (engine_id, mission_id) stream."""

    def __init__(self, max_stale_seconds: float = 15.0) -> None:
        self.max_stale_seconds = max_stale_seconds
        self._last_seq: Dict[Tuple[str, str], int] = {}
        self._last_ts: Dict[Tuple[str, str], datetime] = {}
        self._last_valid_channels: Dict[Tuple[str, str], Dict[str, float]] = {}

        # Cumulative metrics for data-quality audit
        self.total_received: int = 0
        self.total_valid: int = 0
        self.total_rejected_or_degraded: int = 0
        self.duplicate_count: int = 0
        self.out_of_order_count: int = 0
        self.stale_count: int = 0
        self.missing_field_events: int = 0
        self.invalid_sensor_events: int = 0

    def reset_stream(self, engine_id: str, mission_id: str) -> None:
        key = (engine_id, mission_id)
        self._last_seq.pop(key, None)
        self._last_ts.pop(key, None)
        self._last_valid_channels.pop(key, None)

    def get_rejection_stats(self) -> Dict[str, float | int]:
        total = max(1, self.total_received)
        return {
            "total_received": self.total_received,
            "total_valid": self.total_valid,
            "total_rejected_or_degraded": self.total_rejected_or_degraded,
            "degraded_or_rejection_rate": round(self.total_rejected_or_degraded / total, 4),
            "duplicate_count": self.duplicate_count,
            "out_of_order_count": self.out_of_order_count,
            "stale_count": self.stale_count,
            "missing_field_events": self.missing_field_events,
            "invalid_sensor_events": self.invalid_sensor_events,
        }

    def validate_frame(self, frame: TelemetryInputFrame) -> ValidatedTelemetryFrame:
        self.total_received += 1
        key = (frame.engine_id, frame.mission_id)

        missing_fields: List[str] = []
        imputed_fields: List[str] = []
        invalid_sensor_channels: List[str] = []
        validation_notes: List[str] = []
        channel_validity: Dict[str, bool] = {}

        is_duplicate = False
        is_out_of_order = False
        is_stale = False

        # 1. Sequence number & timestamp ordering checks
        parsed_ts = _parse_iso_timestamp(frame.timestamp)
        if parsed_ts is None:
            validation_notes.append(f"Invalid ISO timestamp format: {frame.timestamp}")

        prev_seq = self._last_seq.get(key)
        prev_ts = self._last_ts.get(key)

        if prev_seq is not None:
            if frame.sequence_number == prev_seq:
                is_duplicate = True
                self.duplicate_count += 1
                validation_notes.append(
                    f"Duplicate sequence_number={frame.sequence_number} detected."
                )
            elif frame.sequence_number < prev_seq:
                is_out_of_order = True
                self.out_of_order_count += 1
                validation_notes.append(
                    f"Out-of-order sequence_number={frame.sequence_number} < previous {prev_seq}."
                )

        if parsed_ts is not None and prev_ts is not None:
            try:
                delta_sec = (parsed_ts - prev_ts).total_seconds()
                if delta_sec == 0.0 and not is_duplicate:
                    is_duplicate = True
                    self.duplicate_count += 1
                    validation_notes.append("Duplicate timestamp detected.")
                elif delta_sec < 0.0:
                    is_out_of_order = True
                    self.out_of_order_count += 1
                    validation_notes.append(
                        f"Out-of-order timestamp (delta={delta_sec:.2f}s)."
                    )
                elif delta_sec > self.max_stale_seconds:
                    is_stale = True
                    self.stale_count += 1
                    validation_notes.append(
                        f"Stale telemetry gap detected: delta={delta_sec:.2f}s > {self.max_stale_seconds:.1f}s."
                    )
            except TypeError:
                validation_notes.append("Timestamp timezone mismatch vs previous frame.")

        # Update last seen sequence & timestamp if moving forward
        if prev_seq is None or frame.sequence_number >= prev_seq:
            self._last_seq[key] = frame.sequence_number
        if parsed_ts is not None and (prev_ts is None or parsed_ts >= prev_ts):
            self._last_ts[key] = parsed_ts

        # 2. Channel extraction, missing value imputation, and physical bounds check
        prev_channels = self._last_valid_channels.setdefault(key, {})
        resolved_values: Dict[str, float] = {}

        for ch_name, bounds in SENSOR_PLAUSIBLE_BOUNDS.items():
            raw_val = getattr(frame, ch_name, None)
            if raw_val is None or (
                isinstance(raw_val, float) and (math.isnan(raw_val) or math.isinf(raw_val))
            ):
                missing_fields.append(ch_name)
                imputed_fields.append(ch_name)
                channel_validity[ch_name] = False
                fallback_val = prev_channels.get(ch_name, NOMINAL_CHANNEL_DEFAULTS[ch_name])
                resolved_values[ch_name] = float(fallback_val)
                validation_notes.append(
                    f"Channel '{ch_name}' missing/NaN; imputed with {fallback_val:.2f} {bounds.unit}."
                )
            else:
                val = float(raw_val)
                if val < bounds.min_val or val > bounds.max_val:
                    invalid_sensor_channels.append(ch_name)
                    channel_validity[ch_name] = False
                    # Preserve the raw anomalous reading so the Sensor Fault Isolator can inspect it,
                    # or clamp only extreme numeric overflow
                    resolved_values[ch_name] = max(-9999.0, min(99999.0, val))
                    validation_notes.append(
                        f"Channel '{ch_name}'={val:.2f} {bounds.unit} outside plausible sensor range [{bounds.min_val}, {bounds.max_val}]."
                    )
                else:
                    channel_validity[ch_name] = True
                    resolved_values[ch_name] = val
                    prev_channels[ch_name] = val

        if missing_fields:
            self.missing_field_events += 1
        if invalid_sensor_channels:
            self.invalid_sensor_events += 1

        # Compute quality score in [0.0, 1.0]
        penalties = 0.0
        penalties += 0.12 * len(missing_fields)
        penalties += 0.18 * len(invalid_sensor_channels)
        if is_duplicate:
            penalties += 0.25
        if is_out_of_order:
            penalties += 0.30
        if is_stale:
            penalties += 0.15
        if parsed_ts is None:
            penalties += 0.40

        quality_score = round(max(0.0, min(1.0, 1.0 - penalties)), 3)
        core_missing = [c for c in missing_fields if c in REQUIRED_CORE_CHANNELS]
        is_valid = (
            parsed_ts is not None
            and not is_duplicate
            and not is_out_of_order
            and len(core_missing) <= 2
            and len(invalid_sensor_channels) == 0
        )

        if is_valid and not is_stale and len(missing_fields) == 0:
            self.total_valid += 1
        else:
            self.total_rejected_or_degraded += 1

        quality = DataQualityMetadata(
            is_valid=is_valid,
            is_stale=is_stale,
            is_duplicate=is_duplicate,
            is_out_of_order=is_out_of_order,
            missing_fields=missing_fields,
            imputed_fields=imputed_fields,
            invalid_sensor_channels=invalid_sensor_channels,
            channel_validity=channel_validity,
            quality_score=quality_score,
            validation_notes=validation_notes,
        )

        return ValidatedTelemetryFrame(
            schema_version=frame.schema_version,
            engine_id=frame.engine_id,
            mission_id=frame.mission_id,
            timestamp=frame.timestamp,
            sequence_number=frame.sequence_number,
            mission_elapsed_sec=frame.mission_elapsed_sec,
            rpm=resolved_values["rpm"],
            cht_c=resolved_values["cht_c"],
            egt_c=resolved_values["egt_c"],
            oil_pressure_bar=resolved_values["oil_pressure_bar"],
            oil_temp_c=resolved_values["oil_temp_c"],
            fuel_flow_lph=resolved_values["fuel_flow_lph"],
            vibration_rms_mms=resolved_values["vibration_rms_mms"],
            throttle_pct=resolved_values["throttle_pct"],
            engine_load_pct=resolved_values["engine_load_pct"],
            altitude_m=resolved_values["altitude_m"],
            ambient_temp_c=resolved_values["ambient_temp_c"],
            battery_voltage_v=resolved_values["battery_voltage_v"],
            alternator_current_a=resolved_values["alternator_current_a"],
            injection_pulse_ms=resolved_values["injection_pulse_ms"],
            ignition_advance_deg=resolved_values["ignition_advance_deg"],
            data_source=frame.data_source,
            is_synthetic=frame.is_synthetic,
            units=dict(TELEMETRY_UNITS),
            quality=quality,
            scenario_label=frame.scenario_label,
            fault_severity=frame.fault_severity,
            seed=frame.seed,
        )
