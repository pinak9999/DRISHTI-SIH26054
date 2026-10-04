"""Preset mission scenario definitions and multi-trajectory dataset generator."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple
import numpy as np

from backend.app.simulation.fault_simulator import (
    DeterministicFaultSimulator,
    FaultScenarioConfig,
)
from backend.app.telemetry.schema import NINE_FAULT_CLASSES, TelemetryInputFrame

MISSION_SCENARIO_CATALOG: List[Dict[str, Any]] = [
    {
        "preset_id": "normal_mission",
        "title": "Normal Surveillance Cruise Mission",
        "mission_profile": "normal_mission",
        "fault_class": "Normal",
        "description": "Nominal 3,000 m AMSL loiter profile with standard throttle modulation and clean sensors.",
        "default_altitude_m": 3000.0,
        "default_ambient_temp_c": 14.0,
        "default_throttle_pct": 73.0,
        "default_load_pct": 75.0,
        "default_duration_sec": 90.0,
        "default_onset_sec": 30.0,
        "default_severity": 0.0,
    },
    {
        "preset_id": "high_altitude",
        "title": "High-Altitude Reconnaissance (5,800 m AMSL)",
        "mission_profile": "high_altitude",
        "fault_class": "Normal",
        "description": "Reduced air density (sigma ~ 0.54) and reduced cooling effectiveness requiring turbocharger compensation.",
        "default_altitude_m": 5800.0,
        "default_ambient_temp_c": -18.0,
        "default_throttle_pct": 86.0,
        "default_load_pct": 88.0,
        "default_duration_sec": 90.0,
        "default_onset_sec": 30.0,
        "default_severity": 0.0,
    },
    {
        "preset_id": "hot_weather",
        "title": "Hot-Weather Desert Patrol (+42 degC Ambient)",
        "mission_profile": "hot_weather",
        "fault_class": "Cylinder Overheating",
        "description": "High ambient temperature operation transitioning into cooling baffle degradation and cylinder head overheating.",
        "default_altitude_m": 1200.0,
        "default_ambient_temp_c": 42.0,
        "default_throttle_pct": 78.0,
        "default_load_pct": 80.0,
        "default_duration_sec": 90.0,
        "default_onset_sec": 25.0,
        "default_severity": 0.75,
    },
    {
        "preset_id": "long_endurance",
        "title": "Long-Endurance Loiter with Progressive Bearing Wear",
        "mission_profile": "long_endurance",
        "fault_class": "Crankshaft Bearing Wear",
        "description": "Economy cruise profile experiencing progressive journal bearing clearance wear and oil pressure bleed.",
        "default_altitude_m": 3800.0,
        "default_ambient_temp_c": 6.0,
        "default_throttle_pct": 64.0,
        "default_load_pct": 66.0,
        "default_duration_sec": 100.0,
        "default_onset_sec": 25.0,
        "default_severity": 0.80,
    },
    {
        "preset_id": "rapid_throttle",
        "title": "Rapid Throttle Combat Evasion & Cylinder Misfire",
        "mission_profile": "rapid_throttle",
        "fault_class": "Cylinder Misfire",
        "description": "Aggressive step throttle changes triggering ignition misfire under high transient load.",
        "default_altitude_m": 2600.0,
        "default_ambient_temp_c": 16.0,
        "default_throttle_pct": 76.0,
        "default_load_pct": 78.0,
        "default_duration_sec": 90.0,
        "default_onset_sec": 25.0,
        "default_severity": 0.80,
    },
    {
        "preset_id": "controlled_fault_injection",
        "title": "Controlled Multi-Mode Fault Injection Bench",
        "mission_profile": "controlled_fault_injection",
        "fault_class": "Oil Pressure Drop",
        "description": "Deterministic fault injection scenario for verifying residual shifts, classifier probabilities, and explainable alerts.",
        "default_altitude_m": 2800.0,
        "default_ambient_temp_c": 15.0,
        "default_throttle_pct": 74.0,
        "default_load_pct": 76.0,
        "default_duration_sec": 90.0,
        "default_onset_sec": 20.0,
        "default_severity": 0.78,
    },
    {
        "preset_id": "historical_replay",
        "title": "Historical Recorded Mission Replay",
        "mission_profile": "historical_replay",
        "fault_class": "Fuel Injector Clogging",
        "description": "Recorded mission archive demonstrating progressive fuel nozzle restriction and lean EGT excursion.",
        "default_altitude_m": 3200.0,
        "default_ambient_temp_c": 11.0,
        "default_throttle_pct": 75.0,
        "default_load_pct": 77.0,
        "default_duration_sec": 90.0,
        "default_onset_sec": 22.0,
        "default_severity": 0.75,
    },
]


def generate_labeled_training_and_test_datasets(
    base_seed: int = 1000,
) -> Tuple[List[Tuple[TelemetryInputFrame, float]], List[Tuple[TelemetryInputFrame, float]], Dict[str, Any]]:
    """Generate strictly separated train and test trajectories across distinct engine IDs.

    Returns:
      - train_records: List of (TelemetryInputFrame, ground_truth_rul_hours)
      - test_records: List of (TelemetryInputFrame, ground_truth_rul_hours)
      - dataset_manifest: Provenance and split audit dictionary
    """
    sim = DeterministicFaultSimulator()
    profiles = ["normal_mission", "high_altitude", "hot_weather", "long_endurance", "rapid_throttle"]
    sensor_submodes = ["drift", "stuck_at", "high_noise", "implausible_values"]
    sensor_channels = ["cht_c", "egt_c", "oil_pressure_bar", "vibration_rms_mms"]

    train_records: List[Tuple[TelemetryInputFrame, float]] = []
    test_records: List[Tuple[TelemetryInputFrame, float]] = []
    train_engines: List[str] = []
    test_engines: List[str] = []

    traj_counter = 0
    for split_idx, is_test in enumerate([False, True]):
        # 4 trajectories per class in train, 2 trajectories per class in test
        n_traj_per_class = 2 if is_test else 4
        for class_idx, fault_cls in enumerate(NINE_FAULT_CLASSES):
            for rep in range(n_traj_per_class):
                traj_counter += 1
                seed = base_seed + traj_counter * 17 + class_idx * 3
                rng = np.random.default_rng(seed)

                prefix = "ENG-TEST" if is_test else "ENG-TRAIN"
                engine_id = f"{prefix}-{class_idx + 1:02d}-{rep + 1:02d}"
                mission_id = f"MSN-{'TST' if is_test else 'TRN'}-{traj_counter:03d}"
                if is_test:
                    test_engines.append(engine_id)
                else:
                    train_engines.append(engine_id)

                prof = profiles[(class_idx + rep) % len(profiles)]
                sev = round(float(rng.uniform(0.50, 0.95)), 2) if fault_cls != "Normal" else 0.0
                submode = sensor_submodes[(rep + class_idx) % len(sensor_submodes)]
                sch = sensor_channels[(rep + class_idx) % len(sensor_channels)]

                cfg = FaultScenarioConfig(
                    scenario_id=f"DATASET-{traj_counter:03d}",
                    engine_id=engine_id,
                    mission_id=mission_id,
                    mission_profile=prof,  # type: ignore[arg-type]
                    fault_class=fault_cls,
                    sensor_fault_submode=submode,  # type: ignore[arg-type]
                    sensor_fault_channel=sch,
                    onset_time_sec=6.0 if fault_cls != "Normal" else 999.0,
                    duration_sec=36.0,
                    sample_interval_sec=1.0,
                    severity=sev,
                    random_seed=seed,
                    base_altitude_m=float(rng.uniform(1200.0, 5200.0)),
                    base_ambient_temp_c=float(rng.uniform(-5.0, 35.0)),
                    base_throttle_pct=float(rng.uniform(60.0, 86.0)),
                    base_load_pct=float(rng.uniform(62.0, 88.0)),
                )
                frames = sim.generate_scenario(cfg)

                # Explicit synthetic RUL trajectory label (in mission operating hours):
                # Normal trajectories have nominal horizon (85..100 hours).
                # Fault trajectories degrade from initial horizon (~42..18 hours) down to critical failure (~1.5..12 hours)
                # proportional to fault severity and progression.
                initial_rul = float(rng.uniform(34.0, 48.0))
                final_rul = max(1.2, (1.0 - sev) * 22.0 + float(rng.uniform(0.5, 3.0)))

                for f in frames:
                    if f.scenario_label == "Normal":
                        gt_rul = round(92.0 - 0.05 * f.mission_elapsed_sec, 2)
                    elif f.scenario_label == "Sensor Fault":
                        # Sensor fault is not mechanical life depletion; mark negative sentinel so RUL trainer excludes sensor-only corruption
                        gt_rul = -1.0
                    else:
                        frac = max(
                            0.0,
                            min(
                                1.0,
                                (f.mission_elapsed_sec - cfg.onset_time_sec)
                                / max(1.0, cfg.duration_sec - cfg.onset_time_sec),
                            ),
                        )
                        gt_rul = round(initial_rul - frac * (initial_rul - final_rul), 2)

                    if is_test:
                        test_records.append((f, gt_rul))
                    else:
                        train_records.append((f, gt_rul))

    manifest = {
        "dataset_version": "DRISHTI-SynthCorpus-v1.0",
        "is_synthetic": True,
        "base_seed": base_seed,
        "train_trajectories": len(train_engines),
        "test_trajectories": len(test_engines),
        "train_samples": len(train_records),
        "test_samples": len(test_records),
        "shared_engines_between_train_and_test": len(set(train_engines).intersection(set(test_engines))),
        "classes": NINE_FAULT_CLASSES,
        "rul_target_unit": "hours",
        "rul_definition": (
            "Remaining operating hours until composite thermal/oil/vibration degradation reaches critical maintenance threshold D(t)=1.0."
        ),
    }
    return train_records, test_records, manifest
