"""Automated tests for Deterministic 9-Class Fault Simulator."""

from __future__ import annotations

from backend.app.simulation.fault_simulator import (
    DeterministicFaultSimulator,
    FaultScenarioConfig,
)
from backend.app.telemetry.schema import NINE_FAULT_CLASSES


def test_fault_simulator_reproducibility_and_nine_classes() -> None:
    sim = DeterministicFaultSimulator()

    for fault_cls in NINE_FAULT_CLASSES:
        cfg1 = FaultScenarioConfig(
            scenario_id=f"TEST-{fault_cls}",
            engine_id="ENG-SIM-01",
            mission_id="MSN-SIM-01",
            fault_class=fault_cls,
            onset_time_sec=5.0,
            duration_sec=15.0,
            sample_interval_sec=1.0,
            severity=0.80,
            random_seed=777,
        )
        frames_a = sim.generate_scenario(cfg1)
        frames_b = sim.generate_scenario(cfg1)

        assert len(frames_a) == 15
        assert len(frames_b) == 15
        # Verify exact seed reproducibility
        for fa, fb in zip(frames_a, frames_b):
            assert fa.rpm == fb.rpm
            assert fa.cht_c == fb.cht_c
            assert fa.egt_c == fb.egt_c
            assert fa.oil_pressure_bar == fb.oil_pressure_bar
            assert fa.vibration_rms_mms == fb.vibration_rms_mms
            assert fa.is_synthetic is True

        # Pre-onset frames must be labeled Normal; post-onset frames must have ground-truth fault_cls
        assert frames_a[0].scenario_label == "Normal"
        assert frames_a[-1].scenario_label == fault_cls


def test_sensor_fault_submodes() -> None:
    sim = DeterministicFaultSimulator()

    for submode in ["drift", "stuck_at", "high_noise", "missing_samples", "implausible_values"]:
        cfg = FaultScenarioConfig(
            scenario_id=f"TEST-SF-{submode}",
            engine_id="ENG-SF-01",
            mission_id="MSN-SF-01",
            fault_class="Sensor Fault",
            sensor_fault_submode=submode,  # type: ignore[arg-type]
            sensor_fault_channel="cht_c",
            onset_time_sec=3.0,
            duration_sec=12.0,
            sample_interval_sec=1.0,
            severity=0.85,
            random_seed=123,
        )
        frames = sim.generate_scenario(cfg)
        post_onset = frames[5:]
        if submode == "missing_samples":
            assert any(f.cht_c is None for f in post_onset)
        elif submode == "stuck_at":
            vals = [f.cht_c for f in post_onset]
            assert len(set(vals)) == 1
        elif submode == "implausible_values":
            assert any((f.cht_c or 0.0) > 400.0 for f in post_onset)
