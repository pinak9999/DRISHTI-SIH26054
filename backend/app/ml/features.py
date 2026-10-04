"""Causal feature engineering for DRISHTI ML models."""

from __future__ import annotations

from typing import Dict, List
import numpy as np

from backend.app.telemetry.schema import (
    CalculatedValues,
    ExpectedValues,
    ValidatedTelemetryFrame,
)

FEATURE_NAMES: List[str] = [
    "cht_residual_c",
    "egt_residual_c",
    "oil_pressure_residual_bar",
    "oil_temp_residual_c",
    "fuel_flow_residual_lph",
    "vibration_residual_mms",
    "injection_pulse_residual_ms",
    "cht_rolling_slope_c_per_s",
    "oil_pressure_rolling_slope_bar_per_s",
    "vibration_rolling_slope_mms_per_s",
    "cht_rolling_std_c",
    "vibration_rolling_std_mms",
    "thermal_to_egt_ratio",
    "oil_press_to_rpm_ratio",
    "fuel_to_pulse_ratio",
    "quality_score",
    "invalid_or_missing_channel_count",
]


def extract_feature_vector(
    actual: ValidatedTelemetryFrame,
    expected: ExpectedValues,
    calculated: CalculatedValues,
) -> Dict[str, float]:
    """Extract deterministic causal feature dictionary for a single telemetry point."""
    thermal_to_egt_ratio = actual.cht_c / max(100.0, actual.egt_c)
    oil_press_to_rpm_ratio = actual.oil_pressure_bar / max(500.0, actual.rpm / 1000.0)
    fuel_to_pulse_ratio = actual.fuel_flow_lph / max(0.5, actual.injection_pulse_ms)
    invalid_or_missing = float(
        len(actual.quality.missing_fields) + len(actual.quality.invalid_sensor_channels)
    )

    return {
        "cht_residual_c": float(calculated.cht_residual_c),
        "egt_residual_c": float(calculated.egt_residual_c),
        "oil_pressure_residual_bar": float(calculated.oil_pressure_residual_bar),
        "oil_temp_residual_c": float(calculated.oil_temp_residual_c),
        "fuel_flow_residual_lph": float(calculated.fuel_flow_residual_lph),
        "vibration_residual_mms": float(calculated.vibration_residual_mms),
        "injection_pulse_residual_ms": float(calculated.injection_pulse_residual_ms),
        "cht_rolling_slope_c_per_s": float(calculated.cht_rolling_slope_c_per_s),
        "oil_pressure_rolling_slope_bar_per_s": float(
            calculated.oil_pressure_rolling_slope_bar_per_s
        ),
        "vibration_rolling_slope_mms_per_s": float(
            calculated.vibration_rolling_slope_mms_per_s
        ),
        "cht_rolling_std_c": float(calculated.cht_rolling_std_c),
        "vibration_rolling_std_mms": float(calculated.vibration_rolling_std_mms),
        "thermal_to_egt_ratio": round(thermal_to_egt_ratio, 5),
        "oil_press_to_rpm_ratio": round(oil_press_to_rpm_ratio, 5),
        "fuel_to_pulse_ratio": round(fuel_to_pulse_ratio, 5),
        "quality_score": float(actual.quality.quality_score),
        "invalid_or_missing_channel_count": invalid_or_missing,
    }


def feature_dict_to_array(feat: Dict[str, float]) -> np.ndarray:
    return np.asarray([feat[k] for k in FEATURE_NAMES], dtype=np.float64)
