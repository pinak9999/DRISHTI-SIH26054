import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  Database,
  Download,
  FileText,
  RefreshCw,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { drishtiApi } from '../api/client';
import {
  EmptyState,
  GlassPanel,
  KpiTile,
  Skeleton,
  StatusChip,
  SyntheticBadge,
} from '../components/ui';

export { PredictiveMaintenanceRulScreen } from './rul/PredictiveMaintenanceRulScreen';

/* =========================================================================
   STRONG TYPES FOR EVALUATION, REPORTS & DOCS SCREENS
   ========================================================================= */
interface PerClassMetric {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

interface ClassificationMetrics {
  overall_accuracy: number;
  macro_f1: number;
  classes: string[];
  per_class: Record<string, PerClassMetric>;
  confusion_matrix: number[][];
}

interface AnomalyDetectionMetrics {
  model_type: string;
  calibrated_threshold: number;
  recall: number;
  false_alarm_rate: number;
  precision: number;
  pr_curve: Array<{ recall: number; precision: number }>;
}

interface SensorFaultIsolationMetrics {
  isolator_version: string;
  precision: number;
  recall: number;
  f1: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
}

interface RulEstimationMetrics {
  model_type: string;
  target_unit: string;
  secondary_unit: string;
  held_out_mae_hours: number;
  held_out_rmse_hours: number;
  xgboost_held_out_mae_hours?: number;
  xgboost_held_out_rmse_hours?: number;
  evaluated_samples: number;
}

interface DatasetManifest {
  dataset_id: string;
  is_synthetic: boolean;
  total_trajectories: number;
  train_trajectories: number;
  test_trajectories: number;
  total_samples: number;
  train_samples: number;
  test_samples: number;
  shared_engines_between_train_and_test: number;
  provenance_statement?: string;
}

interface Ppt100kSplitDetail {
  engine_count: number;
  row_count: number;
}

interface Ppt100kEvaluation {
  report_id?: string;
  dataset_manifest?: {
    dataset_version: string;
    is_synthetic: boolean;
    provenance_disclosure?: string;
    base_seed: number;
    total_rows: number;
    total_distinct_engines: number;
    total_trajectories: number;
    splits?: {
      train?: Ppt100kSplitDetail;
      validation?: Ppt100kSplitDetail;
      test?: Ppt100kSplitDetail;
    };
  };
  validation_metrics?: {
    anomaly_detection?: {
      false_alarm_rate: number;
    };
  };
  held_out_test_metrics?: {
    classification: {
      macro_f1: number;
      overall_accuracy: number;
    };
    anomaly_detection: {
      recall: number;
      false_alarm_rate: number;
    };
    rul_xgboost: {
      held_out_mae_cycles: number;
      held_out_rmse_cycles: number;
      held_out_mae_hours: number;
    };
    sensor_fault_isolation: {
      f1: number;
    };
  };
}

interface EvaluationReportData {
  model_version: string;
  classifier_held_out_macro_f1: number;
  xgboost_status?: string;
  xgboost_fallback_note?: string;
  data_provenance_warning: string;
  feature_names: string[];
  feature_importances: Record<string, number>;
  dataset_manifest: DatasetManifest;
  classification_metrics: ClassificationMetrics;
  anomaly_detection_metrics: AnomalyDetectionMetrics;
  sensor_fault_isolation_metrics: SensorFaultIsolationMetrics;
  rul_estimation_metrics: RulEstimationMetrics;
  ppt_100k_evaluation?: Ppt100kEvaluation | null;
}

interface DataQualityStats {
  total_received: number;
  total_valid: number;
  total_rejected_or_degraded: number;
  degraded_or_rejection_rate: number;
  duplicate_count: number;
  out_of_order_count: number;
  stale_count: number;
}

interface EngineeringReportItem {
  report_id: string;
  title: string;
  engine_id: string;
  mission_id: string;
  simulation_id?: string;
  created_at?: string;
  is_synthetic?: boolean;
  data_source?: string;
  physics_model_version?: string;
  ml_model_version?: string;
  scenario_configuration?: {
    scenario_id?: string;
    mission_profile?: string;
    fault_class?: string;
    severity?: number;
    onset_time_sec?: number;
    duration_sec?: number;
    random_seed?: number;
  };
  measured_results?: {
    total_frames?: number;
    alert_count?: number;
    initial_health_index?: number;
    final_health_index?: number;
    final_predicted_class?: string;
    final_top_probability?: number;
    final_rul_status?: string;
    final_rul_hours?: number | null;
    peak_abs_cht_residual_c?: number;
    min_oil_pressure_residual_bar?: number;
  };
  engineering_disclosures?: string[];
}

interface EnvelopeRange {
  min: number;
  nominal: number;
  max: number;
  unit: string;
}

interface PhysicsMetadata {
  model_version: string;
  supported_operating_envelope?: Record<string, EnvelopeRange>;
  assumptions?: string[];
}

interface CanInterfaceMetadata {
  adapter_class: string;
  mode: string;
  hardware_connected: boolean;
  disclosure?: string;
}

interface ParameterGroupSpecItem {
  group_id: number;
  group_name: string;
  channels?: string[];
  unit: string;
  nominal_range: string | number[];
  warning_limits: string | number[];
  critical_limits: string | number[];
}

/* =========================================================================
   SCREEN 8: MODEL EVALUATION (SYNTHETIC HELD-OUT EVALUATION)
   ========================================================================= */
export const ModelEvaluationScreen: React.FC<{
  modelStatus: Record<string, unknown> | null;
  backendError?: string | null;
  onRefreshModelStatus: () => Promise<void>;
}> = ({ modelStatus, backendError = null, onRefreshModelStatus }) => {
  const [retraining, setRetraining] = useState(false);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      await drishtiApi.retrainModels(1000);
      await onRefreshModelStatus();
    } finally {
      setRetraining(false);
    }
  };

  const report = (modelStatus?.evaluation_report ||
    null) as EvaluationReportData | null;

  if (backendError && !report) {
    return (
      <GlassPanel className="panel-card">
        <EmptyState
          icon={<ShieldAlert size={32} />}
          title="ML Evaluation Telemetry Offline"
          description={backendError}
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRefreshModelStatus}
            >
              Retry Connection
            </button>
          }
        />
      </GlassPanel>
    );
  }

  if (!report) {
    return (
      <GlassPanel className="panel-card" style={{ padding: '24px' }}>
        <Skeleton variant="text" width="45%" height={24} />
        <Skeleton
          variant="rect"
          width="100%"
          height={96}
          style={{ marginTop: 12 }}
        />
        <Skeleton
          variant="rect"
          width="100%"
          height={240}
          style={{ marginTop: 12 }}
        />
      </GlassPanel>
    );
  }

  const clsMetrics = report.classification_metrics;
  const anomMetrics = report.anomaly_detection_metrics;
  const sfMetrics = report.sensor_fault_isolation_metrics;
  const rulMetrics = report.rul_estimation_metrics;
  const manifest = report.dataset_manifest;
  const ppt100k = report.ppt_100k_evaluation;

  const importanceData = Object.entries(report.feature_importances || {})
    .map(([feature, imp]) => ({
      feature,
      importance: Number(imp),
    }))
    .sort((a, b) => b.importance - a.importance);

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Validation · Leak-Free Synthetic Held-Out Evaluation
          </div>
          <h1 className="screen-title">
            Machine Learning Evaluation &amp; Synthetic Benchmark Audit
          </h1>
          <div className="screen-desc">
            Engine-disjoint held-out evaluation on{' '}
            {manifest.dataset_id || 'DRISHTI-SynthCorpus-v1.0'} (
            {manifest.shared_engines_between_train_and_test} shared engines
            between train and test splits).
          </div>
        </div>
        <div className="screen-actions">
          <SyntheticBadge
            isSynthetic={true}
            label="SYNTHETIC HELD-OUT EVALUATION"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRetrain}
            disabled={retraining}
          >
            <RefreshCw size={13} />{' '}
            {retraining
              ? 'Retraining Ensemble…'
              : 'Re-Run Leak-Free Training & Evaluation'}
          </button>
        </div>
      </div>

      {/* BACKEND DATA PROVENANCE WARNING BANNER */}
      {report.data_provenance_warning && (
        <GlassPanel
          className="panel-card"
          glow="caution"
          style={{ marginBottom: 14 }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 12,
              lineHeight: 1.55,
              color: 'var(--text-primary)',
            }}
          >
            <AlertTriangle
              size={18}
              style={{
                color: 'var(--color-caution)',
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <div>
              <strong style={{ color: 'var(--color-caution)' }}>
                Data Provenance Warning (/api/model-status):{' '}
              </strong>
              {report.data_provenance_warning}
            </div>
          </div>
        </GlassPanel>
      )}

      {/* SECTION A: SYNTHETIC HELD-OUT BENCHMARK RESULTS */}
      <GlassPanel className="panel-card" glow="cyan">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Database size={14} /> Synthetic Digital Twin Held-Out Benchmark
            Results ({manifest.dataset_id})
          </div>
          <SyntheticBadge
            isSynthetic={Boolean(manifest.is_synthetic)}
            label={`SYNTHETIC HELD-OUT (${manifest.shared_engines_between_train_and_test} SHARED ENGINES)`}
          />
        </div>

        <div className="grid-4">
          <KpiTile
            label="9-Class Macro-F1 (Synthetic held-out)"
            value={clsMetrics.macro_f1 * 100}
            precision={2}
            unit="%"
            status="nominal"
            subtext={`Synthetic held-out Accuracy: ${(
              clsMetrics.overall_accuracy * 100
            ).toFixed(2)}% (${manifest.test_samples} test frames)`}
          />
          <KpiTile
            label="Anomaly Recall (Synthetic held-out)"
            value={anomMetrics.recall * 100}
            precision={1}
            unit="%"
            status="info"
            subtext={`Synthetic held-out FAR: ${(
              anomMetrics.false_alarm_rate * 100
            ).toFixed(2)}% | Precision: ${(
              anomMetrics.precision * 100
            ).toFixed(1)}%`}
          />
          <KpiTile
            label="RUL MAE Error (Synthetic held-out)"
            value={
              rulMetrics.xgboost_held_out_mae_hours ??
              rulMetrics.held_out_mae_hours
            }
            precision={3}
            unit="hrs"
            status="caution"
            subtext={`Synthetic held-out RMSE: ${
              rulMetrics.xgboost_held_out_rmse_hours ??
              rulMetrics.held_out_rmse_hours
            } hrs (N=${rulMetrics.evaluated_samples})`}
          />
          <KpiTile
            label="Leakage Audit (Synthetic held-out)"
            value={`${manifest.shared_engines_between_train_and_test} Shared Engines`}
            status="nominal"
            subtext={`Train: ${manifest.train_trajectories} traj (${manifest.train_samples} rows) | Test: ${manifest.test_trajectories} traj (${manifest.test_samples} rows)`}
          />
        </div>

        {ppt100k?.held_out_test_metrics && ppt100k.dataset_manifest && (
          <div className="grid-4" style={{ marginBottom: 0 }}>
            <KpiTile
              label="100k Macro-F1 (Synthetic held-out)"
              value={
                ppt100k.held_out_test_metrics.classification.macro_f1 * 100
              }
              precision={2}
              unit="%"
              status="nominal"
              subtext={`Synthetic held-out Test: ${
                ppt100k.dataset_manifest.splits?.test?.row_count ?? 0
              } rows (${
                ppt100k.dataset_manifest.splits?.test?.engine_count ?? 0
              } engines) | Acc: ${(
                ppt100k.held_out_test_metrics.classification.overall_accuracy *
                100
              ).toFixed(2)}%`}
            />
            <KpiTile
              label="100k Anomaly Recall (Synthetic held-out)"
              value={
                ppt100k.held_out_test_metrics.anomaly_detection.recall * 100
              }
              precision={2}
              unit="%"
              status="info"
              subtext={`Synthetic held-out FAR: ${(
                ppt100k.held_out_test_metrics.anomaly_detection
                  .false_alarm_rate * 100
              ).toFixed(2)}% | Val FAR: ${(
                (ppt100k.validation_metrics?.anomaly_detection
                  ?.false_alarm_rate ?? 0) * 100
              ).toFixed(2)}%`}
            />
            <KpiTile
              label="100k XGBoost RUL (Synthetic held-out)"
              value={
                ppt100k.held_out_test_metrics.rul_xgboost.held_out_mae_cycles
              }
              precision={3}
              unit="cyc"
              status="caution"
              subtext={`Synthetic held-out RMSE: ${ppt100k.held_out_test_metrics.rul_xgboost.held_out_rmse_cycles} cyc (${ppt100k.held_out_test_metrics.rul_xgboost.held_out_mae_hours} hrs MAE)`}
            />
            <KpiTile
              label="100k Disjoint Split (Synthetic held-out)"
              value={`${ppt100k.dataset_manifest.total_distinct_engines} Engines`}
              status="nominal"
              subtext={`Train: ${
                ppt100k.dataset_manifest.splits?.train?.engine_count ?? 0
              } | Val: ${
                ppt100k.dataset_manifest.splits?.validation?.engine_count ?? 0
              } | Test: ${
                ppt100k.dataset_manifest.splits?.test?.engine_count ?? 0
              } | SF F1: ${(
                ppt100k.held_out_test_metrics.sensor_fault_isolation.f1 * 100
              ).toFixed(1)}%`}
            />
          </div>
        )}
      </GlassPanel>

      <div className="grid-2">
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Award size={14} /> Per-Class Precision, Recall, F1 &amp; Support
              (Synthetic held-out)
            </div>
            <SyntheticBadge isSynthetic={true} label="Synthetic held-out" />
          </div>
          <table className="data-table mono">
            <thead>
              <tr>
                <th>Diagnostic Class</th>
                <th>Precision (Synthetic held-out)</th>
                <th>Recall (Synthetic held-out)</th>
                <th>F1-Score (Synthetic held-out)</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(clsMetrics.per_class).map(
                ([clsName, m]: [string, PerClassMetric]) => (
                  <tr key={clsName}>
                    <td>{clsName}</td>
                    <td>{(m.precision * 100).toFixed(1)}%</td>
                    <td>{(m.recall * 100).toFixed(1)}%</td>
                    <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>
                      {(m.f1 * 100).toFixed(1)}%
                    </td>
                    <td>{m.support}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </GlassPanel>

        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              9×9 Confusion Matrix (Synthetic held-out)
            </div>
            <SyntheticBadge isSynthetic={true} label="Synthetic held-out" />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table mono" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>True \ Pred</th>
                  {clsMetrics.classes.map((c: string, i: number) => (
                    <th key={c} title={c}>
                      C{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clsMetrics.confusion_matrix.map(
                  (row: number[], rIdx: number) => (
                    <tr key={clsMetrics.classes[rIdx] || rIdx}>
                      <td title={clsMetrics.classes[rIdx]}>
                        <strong>C{rIdx + 1}:</strong>{' '}
                        {clsMetrics.classes[rIdx].slice(0, 14)}
                      </td>
                      {row.map((val: number, cIdx: number) => (
                        <td
                          key={cIdx}
                          style={{
                            backgroundColor:
                              rIdx === cIdx && val > 0
                                ? 'rgba(34, 197, 94, 0.22)'
                                : val > 0
                                ? 'rgba(239, 68, 68, 0.25)'
                                : undefined,
                            fontWeight: val > 0 ? 700 : 400,
                          }}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>

      <div className="grid-2">
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Isolation Forest Precision-Recall Curve (Synthetic held-out)
            </div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={anomMetrics.pr_curve}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle, #1a2440)"
                />
                <XAxis
                  dataKey="recall"
                  stroke="var(--text-muted, #8899bb)"
                />
                <YAxis
                  stroke="var(--text-muted, #8899bb)"
                  domain={[0.5, 1.02]}
                />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="precision"
                  name="Anomaly Precision vs Recall (Synthetic held-out)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Random Forest Feature Importance Ranking (Synthetic held-out)
            </div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={importanceData.slice(0, 10)} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle, #1a2440)"
                />
                <XAxis
                  type="number"
                  stroke="var(--text-muted, #8899bb)"
                />
                <YAxis
                  type="category"
                  dataKey="feature"
                  width={165}
                  stroke="var(--text-muted, #8899bb)"
                  fontSize={10.5}
                />
                <Tooltip />
                <Bar dataKey="importance" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            Dedicated Sensor-Fault Isolator &amp; XGBoost Stack Disclosure
            (Synthetic held-out)
          </div>
        </div>
        <div className="mono" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>
            •{' '}
            <strong>
              Sensor-Fault Isolator ({sfMetrics.isolator_version}, Synthetic
              held-out):
            </strong>{' '}
            Precision={(sfMetrics.precision * 100).toFixed(1)}%, Recall=
            {(sfMetrics.recall * 100).toFixed(1)}%, F1=
            {(sfMetrics.f1 * 100).toFixed(1)}% (TP={sfMetrics.true_positives},
            FP={sfMetrics.false_positives}, FN={sfMetrics.false_negatives})
          </div>
          <div>
            • <strong>Estimator Stack Note:</strong>{' '}
            {report.xgboost_status || report.xgboost_fallback_note}
          </div>
        </div>
      </GlassPanel>
    </div>
  );
};

/* =========================================================================
   SCREEN 9: ENGINEERING REPORTS, DATA SOURCES & SYSTEM CONFIGURATION
   ========================================================================= */
export const ReportsAndSettingsScreen: React.FC<{
  reports: Record<string, unknown>[];
  catalog: Record<string, unknown> | null;
  modelStatus: Record<string, unknown> | null;
  backendHealth?: Record<string, unknown> | null;
  backendError?: string | null;
  onRefreshBackend?: () => void;
  onNavigate?: (screen: string) => void;
}> = ({
  reports,
  catalog,
  modelStatus,
  backendError = null,
  onRefreshBackend,
  onNavigate,
}) => {
  const typedReports = reports as unknown as EngineeringReportItem[];
  const [selectedReportId, setSelectedReportId] = useState<string>(
    typedReports[0]?.report_id || ''
  );
  const [activeReport, setActiveReport] =
    useState<EngineeringReportItem | null>(typedReports[0] || null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);

  useEffect(() => {
    if (typedReports.length > 0 && !selectedReportId) {
      setSelectedReportId(typedReports[0].report_id);
      setActiveReport(typedReports[0]);
    }
  }, [typedReports, selectedReportId]);

  const handleSelectReport = async (repId: string) => {
    setSelectedReportId(repId);
    setLoadingReport(true);
    try {
      const full = (await drishtiApi.getReport(
        repId
      )) as unknown as EngineeringReportItem;
      setActiveReport(full);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownloadReportJson = () => {
    if (!activeReport) return;
    const blob = new Blob([JSON.stringify(activeReport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeReport.report_id}_engineering_report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const physMeta = (catalog?.physics_metadata ||
    null) as PhysicsMetadata | null;
  const dqStats = (modelStatus?.data_quality_stats ||
    null) as DataQualityStats | null;
  const canInterface = (catalog?.can_interface ||
    null) as CanInterfaceMetadata | null;

  if (backendError && typedReports.length === 0 && !catalog) {
    return (
      <GlassPanel className="panel-card">
        <EmptyState
          icon={<ShieldAlert size={32} />}
          title="Engineering Reports Offline"
          description={backendError}
          action={
            onRefreshBackend ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRefreshBackend}
              >
                Retry Connection
              </button>
            ) : undefined
          }
        />
      </GlassPanel>
    );
  }

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Validation · Scenario Reports, Physics Envelope &amp; Stream Quality
          </div>
          <h1 className="screen-title">
            Engineering Evaluation Reports &amp; System Configuration
          </h1>
          <div className="screen-desc">
            Export scenario evaluation reports, inspect physics reference
            assumptions and operating envelopes, and audit telemetry
            data-quality rejection counters returned by the backend API.
          </div>
        </div>
        <div className="screen-actions">
          {onNavigate && (
            <button
              type="button"
              className="btn"
              onClick={() => onNavigate('docs')}
            >
              <Activity size={13} /> Open Data Sources &amp; Tech Docs
            </button>
          )}
          <select
            className="select-control"
            value={selectedReportId}
            onChange={(e) => handleSelectReport(e.target.value)}
            aria-label="Select Engineering Report"
          >
            {typedReports.map((r) => (
              <option key={r.report_id} value={r.report_id}>
                {r.report_id} — {r.engine_id} ({r.mission_id})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownloadReportJson}
            disabled={!activeReport}
          >
            <Download size={13} /> Export Engineering Report (JSON)
          </button>
        </div>
      </div>

      {loadingReport ? (
        <GlassPanel className="panel-card" style={{ marginBottom: 14 }}>
          <Skeleton variant="text" width="35%" height={22} />
          <Skeleton
            variant="rect"
            width="100%"
            height={110}
            style={{ marginTop: 10 }}
          />
        </GlassPanel>
      ) : activeReport ? (
        <GlassPanel className="panel-card" style={{ marginBottom: 14 }}>
          <div className="panel-card-header">
            <div className="panel-card-title">
              <FileText size={14} /> {activeReport.title || activeReport.report_id}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SyntheticBadge
                isSynthetic={Boolean(activeReport.is_synthetic ?? true)}
              />
              <StatusChip
                status="nominal"
                label={`REPORT ID: ${activeReport.report_id}`}
              />
            </div>
          </div>
          <div className="grid-4">
            <KpiTile
              label="Engine & Mission"
              value={`${activeReport.engine_id} / ${activeReport.mission_id}`}
              status="info"
              subtext={`Created: ${activeReport.created_at ?? '—'} | Source: ${
                activeReport.data_source ?? '—'
              }`}
            />
            <KpiTile
              label="Scenario Configuration"
              value={`${
                activeReport.scenario_configuration?.fault_class ?? '—'
              } (Sev ${
                activeReport.scenario_configuration?.severity ?? '—'
              })`}
              status="caution"
              subtext={`Seed: ${
                activeReport.scenario_configuration?.random_seed ?? '—'
              } | Onset: ${
                activeReport.scenario_configuration?.onset_time_sec ?? '—'
              }s`}
            />
            <KpiTile
              label="Measured Classification"
              value={`${
                activeReport.measured_results?.final_predicted_class ?? '—'
              } (${(
                (activeReport.measured_results?.final_top_probability || 0) *
                100
              ).toFixed(1)}%)`}
              status="info"
              subtext={`HI: ${
                activeReport.measured_results?.initial_health_index ?? '—'
              }% → ${
                activeReport.measured_results?.final_health_index ?? '—'
              }%`}
            />
            <KpiTile
              label="Model & Rule Versions"
              value={activeReport.ml_model_version ?? '—'}
              status="nominal"
              subtext={`Physics: ${
                activeReport.physics_model_version ?? '—'
              } | Alerts: ${activeReport.measured_results?.alert_count ?? 0}`}
            />
          </div>

          <div style={{ marginTop: 8 }}>
            <div className="kpi-label">
              Engineering Disclosures (/api/reports/{activeReport.report_id})
            </div>
            {(activeReport.engineering_disclosures || []).map(
              (d: string, idx: number) => (
                <div
                  key={idx}
                  className="mono"
                  style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}
                >
                  • {d}
                </div>
              )
            )}
          </div>
        </GlassPanel>
      ) : (
        <GlassPanel className="panel-card" style={{ marginBottom: 14 }}>
          <EmptyState
            icon={<FileText size={28} />}
            title="No Engineering Reports Found"
            description="Run a simulation scenario to generate and persist an engineering evaluation report."
          />
        </GlassPanel>
      )}

      <div className="grid-2">
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Settings size={14} /> Physics Reference Engine Supported Envelope
              ({physMeta?.model_version || '—'})
            </div>
          </div>
          {physMeta ? (
            <>
              <table className="data-table mono" style={{ marginBottom: 10 }}>
                <thead>
                  <tr>
                    <th>Input Parameter</th>
                    <th>Min Supported</th>
                    <th>Nominal Cruise</th>
                    <th>Max Supported</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    physMeta.supported_operating_envelope || {}
                  ).map(([k, v]: [string, EnvelopeRange]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{v.min}</td>
                      <td>{v.nominal}</td>
                      <td>{v.max}</td>
                      <td>{v.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="kpi-label">
                Documented Equations &amp; Assumptions
              </div>
              {(physMeta.assumptions || []).map((a: string, i: number) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                  }}
                >
                  • {a}
                </div>
              ))}
            </>
          ) : (
            <Skeleton variant="rect" width="100%" height={180} />
          )}
        </GlassPanel>

        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Telemetry Stream Validator &amp; CAN Interface Status
            </div>
          </div>
          {dqStats ? (
            <table className="data-table mono" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th>Data-Quality Counter</th>
                  <th>Measured Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total Frames Received</td>
                  <td>{dqStats.total_received}</td>
                </tr>
                <tr>
                  <td>Strictly Valid Clean Frames</td>
                  <td>{dqStats.total_valid}</td>
                </tr>
                <tr>
                  <td>Degraded / Imputed / Rejected Frames</td>
                  <td>{dqStats.total_rejected_or_degraded}</td>
                </tr>
                <tr>
                  <td>Degraded or Rejection Rate</td>
                  <td>
                    {(dqStats.degraded_or_rejection_rate * 100).toFixed(2)}%
                  </td>
                </tr>
                <tr>
                  <td>Duplicate / Out-of-Order / Stale Events</td>
                  <td>
                    {dqStats.duplicate_count} / {dqStats.out_of_order_count} /{' '}
                    {dqStats.stale_count}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Skeleton variant="rect" width="100%" height={140} />
          )}
          {canInterface && (
            <div
              style={{
                padding: 10,
                background: 'rgba(15, 23, 42, 0.7)',
                borderRadius: 4,
              }}
            >
              <div className="kpi-label">
                Modular CAN / SocketCAN Interface Probe
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--cyan)' }}>
                Adapter: {canInterface.adapter_class} | Mode:{' '}
                {canInterface.mode} | Hardware Connected:{' '}
                {String(canInterface.hardware_connected)}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  marginTop: 4,
                }}
              >
                {canInterface.disclosure}
              </div>
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
};

/* =========================================================================
   SCREEN 10: DATA SOURCES, SYSTEM STATUS & TECHNICAL DOCUMENTATION
   ========================================================================= */
export const SystemStatusAndTechDocsScreen: React.FC<{
  backendHealth: Record<string, unknown> | null;
  catalog: Record<string, unknown> | null;
  modelStatus: Record<string, unknown> | null;
  backendError?: string | null;
  onRefreshBackend?: () => void;
}> = ({
  backendHealth,
  catalog,
  modelStatus,
  backendError = null,
  onRefreshBackend,
}) => {
  const [readiness, setReadiness] = useState<Record<string, unknown> | null>(
    null
  );

  useEffect(() => {
    drishtiApi
      .getReadiness()
      .then((r) => setReadiness(r))
      .catch(() => {});
  }, []);

  if (backendError && !backendHealth && !catalog) {
    return (
      <GlassPanel className="panel-card">
        <EmptyState
          icon={<ShieldAlert size={32} />}
          title="System Status & Documentation Offline"
          description={backendError}
          action={
            onRefreshBackend ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRefreshBackend}
              >
                Retry Connection
              </button>
            ) : undefined
          }
        />
      </GlassPanel>
    );
  }

  const dqStats = (modelStatus?.data_quality_stats ||
    null) as DataQualityStats | null;
  const paramSpecs = Array.isArray(catalog?.sih26054_eight_parameter_groups)
    ? (catalog.sih26054_eight_parameter_groups as ParameterGroupSpecItem[])
    : [];
  const evalReport = (modelStatus?.evaluation_report ||
    null) as EvaluationReportData | null;
  const manifest = evalReport?.dataset_manifest;
  const ppt100k = evalReport?.ppt_100k_evaluation;
  const canInterface = (backendHealth?.can_interface ||
    catalog?.can_interface ||
    null) as CanInterfaceMetadata | null;

  const readyStatus = String(readiness?.status || 'OK').toUpperCase();
  const dbReady = readiness?.database_ready !== false;
  const seededCount =
    typeof readiness?.seeded_engine_count === 'number'
      ? readiness.seeded_engine_count
      : 0;

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Validation · Dataset Provenance, System Readiness &amp; SIH26054
            Architecture
          </div>
          <h1 className="screen-title">
            Data Sources, System Status &amp; Technical Documentation
          </h1>
          <div className="screen-desc">
            Dataset provenance register, live subsystem readiness checks
            (/health &amp; /ready), SIH26054 8-group data dictionary, and
            architecture documentation.
          </div>
        </div>
        <StatusChip
          status={dbReady ? 'nominal' : 'critical'}
          label={`SYSTEM READY: ${readyStatus}`}
        />
      </div>

      <div className="grid-4">
        <KpiTile
          label="Backend & SQLite WAL Readiness"
          value={dbReady ? 'READY (WAL)' : 'OFFLINE'}
          status={dbReady ? 'nominal' : 'critical'}
          subtext={`Seeded Fleet: ${seededCount} UAV Engines | Schema v${String(
            backendHealth?.telemetry_schema_version || '—'
          )}`}
        />
        <KpiTile
          label="Physics & ML Ensemble Status"
          value={
            backendHealth?.ml_models_loaded ? 'LOADED & ACTIVE' : 'FALLBACK'
          }
          status={backendHealth?.ml_models_loaded ? 'info' : 'caution'}
          subtext={`${String(
            backendHealth?.physics_model_version || '—'
          )} | ${String(backendHealth?.ml_model_version || '—')}`}
        />
        <KpiTile
          label="CAN / SocketCAN Hardware Adapter"
          value={canInterface?.mode || 'SOFTWARE_CODEC_READY'}
          status="caution"
          subtext={`Adapter: ${
            canInterface?.adapter_class || '—'
          } | HW Connected: ${String(
            canInterface?.hardware_connected ?? false
          )}`}
        />
        <KpiTile
          label="Telemetry Stream Validator"
          value={`${dqStats?.total_valid ?? 0} / ${
            dqStats?.total_received ?? 0
          } Valid`}
          status="nominal"
          subtext={`Dup: ${dqStats?.duplicate_count ?? 0} | Out-of-Order: ${
            dqStats?.out_of_order_count ?? 0
          } | Stale: ${dqStats?.stale_count ?? 0}`}
        />
      </div>

      {/* DATASET PROVENANCE REGISTER (FROM API MANIFESTS) */}
      <GlassPanel className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            API Dataset Provenance Register (/api/model-status)
          </div>
          <SyntheticBadge
            isSynthetic={true}
            label="SYNTHETIC PROVENANCE DISCLOSURE"
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table mono" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Dataset ID</th>
                <th>Source &amp; Provenance Statement</th>
                <th>Scale &amp; Split (API Manifest)</th>
                <th>Measured Held-Out Metrics</th>
                <th>Evidence Classification</th>
              </tr>
            </thead>
            <tbody>
              {manifest && (
                <tr>
                  <td>
                    <strong>{manifest.dataset_id}</strong>
                  </td>
                  <td>
                    {manifest.provenance_statement ||
                      evalReport?.data_provenance_warning}
                  </td>
                  <td>
                    {manifest.total_trajectories} Trajectories (
                    {manifest.total_samples} frames: {manifest.train_trajectories}{' '}
                    train = {manifest.train_samples} /{' '}
                    {manifest.test_trajectories} test = {manifest.test_samples};{' '}
                    {manifest.shared_engines_between_train_and_test} shared
                    engines)
                  </td>
                  <td>
                    Macro-F1:{' '}
                    {(
                      (evalReport?.classification_metrics.macro_f1 ?? 0) * 100
                    ).toFixed(2)}
                    %, Acc:{' '}
                    {(
                      (evalReport?.classification_metrics.overall_accuracy ??
                        0) * 100
                    ).toFixed(2)}
                    %, IsoForest Recall:{' '}
                    {(
                      (evalReport?.anomaly_detection_metrics.recall ?? 0) * 100
                    ).toFixed(1)}
                    %, RUL MAE:{' '}
                    {evalReport?.rul_estimation_metrics
                      .xgboost_held_out_mae_hours ??
                      evalReport?.rul_estimation_metrics.held_out_mae_hours}{' '}
                    h
                  </td>
                  <td>
                    <SyntheticBadge
                      isSynthetic={Boolean(manifest.is_synthetic)}
                      label="SYNTHETIC HELD-OUT"
                    />
                  </td>
                </tr>
              )}
              {ppt100k?.dataset_manifest && ppt100k.held_out_test_metrics && (
                <tr>
                  <td>
                    <strong>{ppt100k.dataset_manifest.dataset_version}</strong>
                  </td>
                  <td>
                    {ppt100k.dataset_manifest.provenance_disclosure ||
                      `Seed ${ppt100k.dataset_manifest.base_seed}`}
                  </td>
                  <td>
                    {ppt100k.dataset_manifest.total_rows} rows |{' '}
                    {ppt100k.dataset_manifest.total_distinct_engines} Engines (
                    Train:{' '}
                    {ppt100k.dataset_manifest.splits?.train?.engine_count ?? 0}{' '}
                    [{ppt100k.dataset_manifest.splits?.train?.row_count ?? 0}] /
                    Val:{' '}
                    {ppt100k.dataset_manifest.splits?.validation?.engine_count ??
                      0}{' '}
                    [
                    {ppt100k.dataset_manifest.splits?.validation?.row_count ??
                      0}
                    ] / Test:{' '}
                    {ppt100k.dataset_manifest.splits?.test?.engine_count ?? 0} [
                    {ppt100k.dataset_manifest.splits?.test?.row_count ?? 0}])
                  </td>
                  <td>
                    Macro-F1:{' '}
                    {(
                      ppt100k.held_out_test_metrics.classification.macro_f1 *
                      100
                    ).toFixed(2)}
                    %, Acc:{' '}
                    {(
                      ppt100k.held_out_test_metrics.classification
                        .overall_accuracy * 100
                    ).toFixed(2)}
                    %, Recall:{' '}
                    {(
                      ppt100k.held_out_test_metrics.anomaly_detection.recall *
                      100
                    ).toFixed(2)}
                    %, RUL MAE:{' '}
                    {
                      ppt100k.held_out_test_metrics.rul_xgboost
                        .held_out_mae_cycles
                    }{' '}
                    cyc (
                    {
                      ppt100k.held_out_test_metrics.rul_xgboost
                        .held_out_mae_hours
                    }{' '}
                    h)
                  </td>
                  <td>
                    <SyntheticBadge
                      isSynthetic={Boolean(
                        ppt100k.dataset_manifest.is_synthetic
                      )}
                      label="SYNTHETIC HELD-OUT"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {/* DATA DICTIONARY & 8 PARAMETER GROUPS */}
      <div className="grid-2">
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              SIH26054 Data Dictionary — All 8 Monitored Parameter Groups
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table mono" style={{ fontSize: 10.5 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Parameter Group</th>
                  <th>Schema Channels</th>
                  <th>Unit</th>
                  <th>Nominal Range</th>
                  <th>Warning / Critical</th>
                </tr>
              </thead>
              <tbody>
                {paramSpecs.map((p: ParameterGroupSpecItem) => (
                  <tr key={p.group_id}>
                    <td>#{p.group_id}</td>
                    <td>
                      <strong>{p.group_name}</strong>
                    </td>
                    <td>{(p.channels || []).join(', ')}</td>
                    <td>{p.unit}</td>
                    <td>
                      {Array.isArray(p.nominal_range)
                        ? p.nominal_range.join(' – ')
                        : p.nominal_range}
                    </td>
                    <td>
                      Warn:{' '}
                      {Array.isArray(p.warning_limits)
                        ? p.warning_limits.join(' / ')
                        : p.warning_limits}{' '}
                      | Crit:{' '}
                      {Array.isArray(p.critical_limits)
                        ? p.critical_limits.join(' / ')
                        : p.critical_limits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>

        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Architecture, Security &amp; Future Hardware Integration Roadmap
            </div>
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}
          >
            <div>
              • <strong>Modular 5-Layer Architecture:</strong> (1) Telemetry
              Ingestion &amp; Validator (`SocketCAN` codec, CSV, REST,
              WebSocket) → (2) Physics Reference Baseline (
              {String(backendHealth?.physics_model_version || '—')}) → (3)
              Deterministic Residual &amp; Sliding-Window Feature Extractor (
              {evalReport?.feature_names.length ?? 0} features) → (4) ML
              Ensemble (`RandomForest`, `IsolationForest`, `XGBRegressor`,
              `SensorFaultIsolator`) → (5) SQLite WAL Store &amp; 3D React
              Workstation.
            </div>
            <div>
              • <strong>Prototype Security &amp; Reliability Controls:</strong>{' '}
              Strict Pydantic range/enum validation,
              duplicate/stale/out-of-order frame detection, parameterized SQLite
              queries, `/health` and `/ready` probes, and `.env.example`
              externalized configuration.
            </div>
            <div>
              • <strong>Future Defence Deployment Roadmap:</strong> Connect
              physical UAV FADEC / Rotax 914 ECU via isolated USB-CAN
              transceiver (`python-can` on `can0`), add mTLS/JWT operator RBAC,
              and calibrate thermal/vibration transfer functions on DRDO
              propulsion test-bed runs.
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
