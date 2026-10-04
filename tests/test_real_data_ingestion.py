"""Automated tests for Phase 2 Real-Data Ingestion, Provenance, Unit Conversions, and Split Leakage."""

from __future__ import annotations

import json
import math
import numpy as np
import pandas as pd
import pytest

from backend.app.data_ingestion.real_data_pipeline import (
    LIU_ICE_EXPECTED_SHA256,
    MARINE_EXPECTED_MD5,
    MARINE_EXPECTED_SHA256,
    REPO_ROOT,
    RealDatasetIngestor,
    kelvin_to_celsius,
    kg_per_sec_to_lph,
    kgf_cm2_to_bar,
    pa_to_isa_altitude_m,
    rad_per_sec_to_rpm,
    validate_drishti_mapped_dataframe,
)


def test_unit_conversions_exact_physics() -> None:
    """Verify deterministic physical unit conversion formulas."""
    # Angular velocity rad/s -> RPM
    assert math.isclose(float(rad_per_sec_to_rpm(math.pi)), 30.0, rel_tol=1e-9)
    assert math.isclose(float(rad_per_sec_to_rpm(100.0)), 954.929658551372, rel_tol=1e-9)

    # Kelvin -> Celsius
    assert math.isclose(float(kelvin_to_celsius(273.15)), 0.0, abs_tol=1e-9)
    assert math.isclose(float(kelvin_to_celsius(300.0)), 26.85, abs_tol=1e-9)

    # Fuel mass flow kg/s -> L/h
    assert math.isclose(float(kg_per_sec_to_lph(0.000745, density_kg_per_l=0.745)), 3.6, rel_tol=1e-9)
    with pytest.raises(ValueError, match="Fuel density must be positive"):
        kg_per_sec_to_lph(0.001, density_kg_per_l=0.0)

    # ISA pressure -> altitude
    assert math.isclose(float(pa_to_isa_altitude_m(101325.0)), 0.0, abs_tol=1e-6)
    assert float(pa_to_isa_altitude_m(90000.0)) > 900.0

    # kgf/cm2 -> bar
    assert math.isclose(float(kgf_cm2_to_bar(1.0)), 0.980665, rel_tol=1e-9)


def test_schema_validator_rejects_invalid_frames() -> None:
    """Verify schema validator catches missing provenance, synthetic flag misuse, and negative dt."""
    valid_df = pd.DataFrame({
        "dataset_id": ["Test-DS", "Test-DS"],
        "source_file": ["f.csv", "f.csv"],
        "source_archive_sha256": ["abc", "abc"],
        "engine_id": ["ENG-01", "ENG-01"],
        "run_id": ["RUN-01", "RUN-01"],
        "timestamp_sec": [0.0, 1.0],
        "is_synthetic": [False, False],
        "data_source": ["BENCH_TEST", "BENCH_TEST"],
        "rpm": [1500.0, 1520.0],
    })
    res = validate_drishti_mapped_dataframe(valid_df, "Test-DS")
    assert res["provenance_verified"] is True

    # 1. Reject is_synthetic=True on real dataset
    bad_synth = valid_df.copy()
    bad_synth["is_synthetic"] = True
    with pytest.raises(ValueError, match="is_synthetic=False"):
        validate_drishti_mapped_dataframe(bad_synth, "Test-DS")

    # 2. Reject negative time step
    bad_time = valid_df.copy()
    bad_time["timestamp_sec"] = [2.0, 1.0]
    with pytest.raises(ValueError, match="negative timestamp steps"):
        validate_drishti_mapped_dataframe(bad_time, "Test-DS")

    # 3. Reject out-of-range RPM
    bad_rpm = valid_df.copy()
    bad_rpm["rpm"] = [-50.0, 1500.0]
    with pytest.raises(ValueError, match="outside plausible physical bounds"):
        validate_drishti_mapped_dataframe(bad_rpm, "Test-DS")

    # 4. Reject missing provenance column
    bad_cols = valid_df.drop(columns=["source_archive_sha256"])
    with pytest.raises(ValueError, match="Missing required provenance columns"):
        validate_drishti_mapped_dataframe(bad_cols, "Test-DS")


def test_archive_verification_and_provenance_retention() -> None:
    """Verify raw dataset hashes, non-fabrication of missing sensors, and 999.0 sentinel masking."""
    ingestor = RealDatasetIngestor()
    hashes = ingestor.verify_raw_archives()
    assert hashes["liu_ice_archive"]["sha256"] == LIU_ICE_EXPECTED_SHA256
    assert hashes["marine_engine_archive"]["sha256"] == MARINE_EXPECTED_SHA256
    assert hashes["marine_engine_archive"]["md5"] == MARINE_EXPECTED_MD5

    # Ingest LiU-ICE
    liu_df, liu_summaries = ingestor.ingest_liu_ice()
    assert len(liu_summaries) == 8
    assert len(liu_df) == 288623
    assert (liu_df["dataset_id"] == "LiU-ICE-Benchmark-DXC25").all()
    assert (liu_df["engine_id"] == "ENG-LIU-ICE-01").all()
    assert (~liu_df["is_synthetic"]).all()
    # Non-fabrication checks
    assert liu_df["cht_c"].isna().all()
    assert liu_df["egt_c"].isna().all()
    assert liu_df["oil_pressure_bar"].isna().all()
    assert liu_df["vibration_rms_mms"].isna().all()
    assert liu_df["rul_hours"].isna().all()
    # Converted RPM check (80.16 rad/s -> ~765.5 RPM)
    assert liu_df["rpm"].min() > 700.0
    assert liu_df["rpm"].max() < 3500.0

    # Ingest Marine Engine Fault
    marine_df, marine_summaries = ingestor.ingest_marine_engine_fault()
    assert len(marine_summaries) == 16
    assert len(marine_df) == 114770
    assert (marine_df["dataset_id"] == "Marine-Engine-Fault-v1.0").all()
    assert (marine_df["engine_id"] == "ENG-MATSUI-MU323-01").all()
    assert (~marine_df["is_synthetic"]).all()
    # Non-fabrication checks
    assert marine_df["cht_c"].isna().all()
    assert marine_df["oil_pressure_bar"].isna().all()
    assert marine_df["vibration_rms_mms"].isna().all()
    assert marine_df["rul_hours"].isna().all()

    # Verify 999.0 thermocouple sentinels were detected in raw data and masked from cleaned columns
    total_sentinels = sum(sum(s.sentinel_999_counts.values()) for s in marine_summaries)
    assert total_sentinels == 5425
    assert (marine_df["cooling_water_out_3_c"] == 999.0).sum() == 0
    assert (marine_df["turbine_out_egt_c"] == 999.0).sum() == 0


def test_run_aware_splits_prevent_leakage_and_reports_exist() -> None:
    """Verify zero shared run_ids between train and test splits and separate evaluation reports."""
    ingestor = RealDatasetIngestor()
    liu_df, _ = ingestor.ingest_liu_ice()
    marine_df, _ = ingestor.ingest_marine_engine_fault()

    l_train, l_test, l_manifest = ingestor.split_liu_ice_by_run(liu_df)
    assert l_manifest["shared_run_ids_between_train_and_test"] == 0
    assert set(l_train["run_id"].unique()).isdisjoint(set(l_test["run_id"].unique()))

    m_train, m_test, m_manifest = ingestor.split_marine_by_run(marine_df)
    assert m_manifest["shared_run_ids_between_train_and_test"] == 0
    assert set(m_train["run_id"].unique()).isdisjoint(set(m_test["run_id"].unique()))
    # Verify all 6 Marine classes exist in both train and test
    assert set(m_train["sample_fault_label"].unique()) == set(m_test["sample_fault_label"].unique())
    assert len(m_train["sample_fault_label"].unique()) == 6

    # Verify separate synthetic and real evaluation reports exist and are honestly tagged
    synth_path = REPO_ROOT / "backend" / "artifacts" / "synthetic_baseline_report.json"
    real_path = REPO_ROOT / "backend" / "artifacts" / "real_data_evaluation_report.json"
    qual_path = REPO_ROOT / "data" / "processed" / "real_data_quality_report.json"

    assert synth_path.exists()
    assert real_path.exists()
    assert qual_path.exists()

    synth_rep = json.loads(synth_path.read_text(encoding="utf-8"))
    real_rep = json.loads(real_path.read_text(encoding="utf-8"))

    assert synth_rep["evaluation_scope"] == "SYNTHETIC-ONLY"
    assert real_rep["evaluation_scope"] == "REAL_EXPERIMENTAL_BENCH_DATA_ONLY"
    assert (
        real_rep["datasets_evaluated"]["LiU-ICE-Benchmark-DXC25"]["rul_evaluation"]["status"]
        == "NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS"
    )
    assert (
        real_rep["datasets_evaluated"]["Marine-Engine-Fault-v1.0"]["rul_evaluation"]["status"]
        == "NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS"
    )
