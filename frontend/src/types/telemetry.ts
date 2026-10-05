export type AlertSeverity = 'ADVISORY' | 'CAUTION' | 'WARNING' | 'CRITICAL';

export interface DataQualityMetadata {
  is_valid: boolean;
  is_stale: boolean;
  is_duplicate: boolean;
  is_out_of_order: boolean;
  missing_fields: string[];
  imputed_fields: string[];
  invalid_sensor_channels: string[];
  channel_validity: Record<string, boolean>;
  quality_score: number;
  validation_notes: string[];
}

export interface ValidatedTelemetryFrame {
  schema_version: string;
  engine_id: string;
  mission_id: string;
  timestamp: string;
  sequence_number: number;
  mission_elapsed_sec: number;
  rpm: number;
  cht_c: number;
  egt_c: number;
  oil_pressure_bar: number;
  oil_temp_c: number;
  fuel_flow_lph: number;
  vibration_rms_mms: number;
  throttle_pct: number;
  engine_load_pct: number;
  altitude_m: number;
  ambient_temp_c: number;
  battery_voltage_v: number;
  alternator_current_a: number;
  injection_pulse_ms: number;
  ignition_advance_deg: number;
  data_source: string;
  is_synthetic: boolean;
  units: Record<string, string>;
  quality: DataQualityMetadata;
  scenario_label?: string;
  fault_severity: number;
  seed?: number;
}

export interface ExpectedValues {
  model_version: string;
  timestamp: string;
  source: string;
  units: Record<string, string>;
  is_valid: boolean;
  is_extrapolated: boolean;
  extrapolation_reasons: string[];
  air_density_ratio: number;
  cooling_effectiveness: number;
  cht_c: number;
  egt_c: number;
  oil_pressure_bar: number;
  oil_temp_c: number;
  fuel_flow_lph: number;
  vibration_rms_mms: number;
  battery_voltage_v: number;
  injection_pulse_ms: number;
  ignition_advance_deg: number;
}

export interface CalculatedValues {
  calculator_version: string;
  timestamp: string;
  source: string;
  is_valid: boolean;
  units: Record<string, string>;
  cht_residual_c: number;
  egt_residual_c: number;
  oil_pressure_residual_bar: number;
  oil_temp_residual_c: number;
  fuel_flow_residual_lph: number;
  vibration_residual_mms: number;
  battery_voltage_residual_v: number;
  injection_pulse_residual_ms: number;
  cht_rolling_mean_c: number;
  cht_rolling_std_c: number;
  cht_rolling_slope_c_per_s: number;
  egt_rolling_mean_c: number;
  oil_pressure_rolling_mean_bar: number;
  oil_pressure_rolling_slope_bar_per_s: number;
  vibration_rolling_mean_mms: number;
  vibration_rolling_std_mms: number;
  vibration_rolling_slope_mms_per_s: number;
  thermal_margin_pct: number;
  oil_pressure_margin_pct: number;
  vibration_margin_pct: number;
  specific_fuel_index: number;
  envelope_violations: string[];
}

export interface SensorDiagnosisResult {
  isolator_version: string;
  is_sensor_fault_detected: boolean;
  is_ambiguous: boolean;
  diagnosis_status:
    | 'SENSORS_NOMINAL'
    | 'SENSOR_FAULT_ISOLATED'
    | 'AMBIGUOUS_SENSOR_VS_ENGINE'
    | 'INSUFFICIENT_EVIDENCE';
  suspected_channels: string[];
  fault_submode: string | null;
  confidence: number;
  evidence: string[];
}

export interface PredictedValues {
  model_version: string;
  timestamp: string;
  source: string;
  is_valid: boolean;
  predicted_fault_class: string;
  diagnosis_certainty_status:
    | 'CONFIDENT_DIAGNOSIS'
    | 'UNCERTAIN_INSUFFICIENT_EVIDENCE'
    | 'SENSOR_FAULT_OVERRIDE'
    | 'DEGRADED_INPUT_QUALITY';
  top_probability: number;
  class_probabilities: Record<string, number>;
  is_anomaly: boolean;
  anomaly_score: number;
  anomaly_threshold: number;
  sensor_diagnosis: SensorDiagnosisResult;
  rul_status: 'ESTIMATED' | 'NOT_ESTIMABLE';
  rul_hours: number | null;
  rul_lower_10_hours: number | null;
  rul_upper_90_hours: number | null;
  rul_unit: string;
  rul_cycles?: number | null;
  rul_lower_10_cycles?: number | null;
  rul_upper_90_cycles?: number | null;
  rul_cycle_unit?: string;
  rul_reason: string;
  health_index: number;
  health_breakdown: Record<string, number>;
}

export interface FourValueDigitalTwinState {
  schema_version: string;
  engine_id: string;
  mission_id: string;
  timestamp: string;
  sequence_number: number;
  mission_elapsed_sec: number;
  data_source: string;
  is_synthetic: boolean;
  actual: ValidatedTelemetryFrame;
  expected: ExpectedValues;
  calculated: CalculatedValues;
  predicted: PredictedValues;
}

export interface ExplainableAlert {
  alert_id: string;
  engine_id: string;
  mission_id: string;
  timestamp: string;
  sequence_number: number;
  fault_class: string;
  anomaly_type: string;
  severity: AlertSeverity;
  supporting_evidence: string[];
  actual_vs_expected_deviations: Record<string, number>;
  model_probability: number;
  anomaly_score: number;
  score_label: string;
  data_quality_limitations: string[];
  model_version: string;
  rule_version: string;
  recommended_action: string;
  is_simulated_evidence: boolean;
  evidence_source_statement: string;
  acknowledged: boolean;
}

export interface EngineRecord {
  engine_id: string;
  tail_number: string;
  uav_platform: string;
  engine_model: string;
  serial_number: string;
  total_operating_hours: number;
  status: string;
  active_mission_id: string;
  latest_health_index: number;
  latest_fault_class: string;
  latest_rul_status: string;
  latest_rul_hours: number | null;
  data_source: string;
  is_synthetic: boolean;
  updated_at: string;
  alert_count?: number;
}

export interface FleetOverview {
  fleet_size: number;
  nominal_count: number;
  caution_count: number;
  warning_count: number;
  critical_count: number;
  mean_fleet_health_index: number;
  total_active_alerts: number;
  engines: EngineRecord[];
  recent_alerts: ExplainableAlert[];
  can_adapter_status: Record<string, unknown>;
  data_quality_stats: Record<string, number>;
}

export interface FaultScenarioConfig {
  scenario_id: string;
  engine_id: string;
  mission_id: string;
  mission_profile: string;
  fault_class: string;
  sensor_fault_submode: string;
  sensor_fault_channel: string;
  onset_time_sec: number;
  duration_sec: number;
  sample_interval_sec: number;
  severity: number;
  random_seed: number;
  base_altitude_m: number;
  base_ambient_temp_c: number;
  base_throttle_pct: number;
  base_load_pct: number;
}

export interface ReplaySnapshot {
  is_playing: boolean;
  playback_speed: number;
  mission_id: string | null;
  engine_id: string | null;
  current_index: number;
  total_frames: number;
  current_timestamp: string | null;
  current_elapsed_sec: number;
  mission_metadata: Record<string, unknown>;
  current_state: FourValueDigitalTwinState | null;
  synchronized_history: FourValueDigitalTwinState[];
  synchronized_alerts: ExplainableAlert[];
  all_mission_alerts: ExplainableAlert[];
}

/**
 * Residual trigger thresholds matching backend/app/alerts/alert_engine.py (lines 23-30).
 */
export const RESIDUAL_ALERT_THRESHOLDS = {
  cht_c: 10.0,
  egt_c: 25.0,
  oil_pressure_bar: -0.35,
  oil_temp_c: 8.0,
  vibration_mms: 0.70,
  fuel_flow_lph: 1.8,
} as const;

export interface UnifiedDiagnosisSummary {
  faultClass: string;
  confidencePct: string;
  topProbability: number;
  certainty: string;
  isAnomaly: boolean;
  anomalyScore: number;
  anomalyThreshold: number;
  sensorStatus: string;
}

export function extractUnifiedDiagnosis(
  state: FourValueDigitalTwinState | null
): UnifiedDiagnosisSummary {
  if (!state) {
    return {
      faultClass: 'Normal',
      confidencePct: '0.0',
      topProbability: 0,
      certainty: 'UNCERTAIN_INSUFFICIENT_EVIDENCE',
      isAnomaly: false,
      anomalyScore: 0,
      anomalyThreshold: 0,
      sensorStatus: 'SENSORS_NOMINAL',
    };
  }
  const p = state.predicted;
  return {
    faultClass: p.predicted_fault_class,
    confidencePct: (p.top_probability * 100).toFixed(1),
    topProbability: p.top_probability,
    certainty: p.diagnosis_certainty_status,
    isAnomaly: p.is_anomaly,
    anomalyScore: p.anomaly_score,
    anomalyThreshold: p.anomaly_threshold,
    sensorStatus: p.sensor_diagnosis.diagnosis_status,
  };
}

export interface ParameterGroupStats {
  mean: number;
  min: number;
  max: number;
}

export interface ParameterGroupItem {
  group_id: number;
  group_name: string;
  unit: string;
  current_value: string;
  expected_value: string;
  residual_value: string;
  operating_range: string;
  historical_stats?: ParameterGroupStats;
  quality_freshness?: string;
  abnormality_detected?: boolean;
  severity: string;
  health_contribution: string;
}

export interface MissionPresetItem {
  preset_id: string;
  title: string;
  mission_profile: string;
  fault_class: string;
  default_onset_sec: number;
  default_duration_sec: number;
  default_severity: number;
  default_altitude_m: number;
  default_ambient_temp_c: number;
  default_throttle_pct: number;
  default_load_pct: number;
}

export interface MissionRecordItem {
  mission_id: string;
  engine_id: string;
  title?: string;
  mission_profile?: string;
  fault_class: string;
  severity?: number;
  duration_sec?: number;
  data_source?: string;
  is_synthetic?: boolean;
  created_at?: string;
}

export interface SimulationSummaryData {
  total_frames: number;
  alert_count: number;
  initial_health_index: number;
  final_health_index: number;
  min_health_index?: number;
  final_predicted_class: string;
  final_top_probability: number;
  final_rul_status: string;
  final_rul_hours: number | null;
  final_rul_interval_hours?: [number | null, number | null];
  peak_abs_cht_residual_c: number;
  peak_abs_vibration_residual_mms?: number;
  min_oil_pressure_residual_bar?: number;
  processing_throughput_fps: number;
  mean_frame_latency_ms: number;
}

export interface SimulationResultData {
  simulation_id: string;
  report_id: string;
  engine: EngineRecord;
  mission: MissionRecordItem;
  summary: SimulationSummaryData;
  latest_state: FourValueDigitalTwinState;
  telemetry?: FourValueDigitalTwinState[];
  alerts?: ExplainableAlert[];
}

