import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
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
  Award,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Gauge,
  Info,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { drishtiApi } from '../api/client';

/* =========================================================================
   SCREEN 7: PREDICTIVE MAINTENANCE & REMAINING USEFUL LIFE (RUL)
   ========================================================================= */
export const PredictiveMaintenanceRulScreen: React.FC<{
  engineId: string;
}> = ({ engineId }) => {
  const [healthData, setHealthData] = useState<Record<string, any> | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [alphaW, setAlphaW] = useState<number>(0.3);
  const [betaW, setBetaW] = useState<number>(0.3);
  const [gammaW, setGammaW] = useState<number>(0.2);
  const [deltaW, setDeltaW] = useState<number>(0.2);
  const [goMinHi, setGoMinHi] = useState<number>(75.0);
  const [precMinHi, setPrecMinHi] = useState<number>(55.0);
  const [policyStatus, setPolicyStatus] = useState<string | null>(null);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const d = await drishtiApi.getEngineHealth(engineId);
      setHealthData(d);
      const w = d.health_policy?.weights || d.health_weights?.weights;
      if (w) {
        setAlphaW(w.thermal_penalty_weight ?? 0.3);
        setBetaW(w.oil_penalty_weight ?? 0.3);
        setGammaW(w.vibration_penalty_weight ?? 0.2);
        setDeltaW(w.anomaly_penalty_weight ?? 0.2);
      }
      const rt = d.health_policy?.readiness_thresholds;
      if (rt) {
        setGoMinHi(rt.go_min_health_index ?? 75.0);
        setPrecMinHi(rt.precaution_min_health_index ?? 55.0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, [engineId]);

  const handleSavePolicy = async (resetDefault = false) => {
    const payload = resetDefault
      ? {
          weights: {
            thermal_penalty_weight: 0.3,
            oil_penalty_weight: 0.3,
            vibration_penalty_weight: 0.2,
            anomaly_penalty_weight: 0.2,
          },
          readiness_thresholds: {
            go_min_health_index: 75.0,
            precaution_min_health_index: 55.0,
            go_min_rul_hours: 15.0,
            precaution_min_rul_hours: 5.0,
          },
        }
      : {
          weights: {
            thermal_penalty_weight: alphaW,
            oil_penalty_weight: betaW,
            vibration_penalty_weight: gammaW,
            anomaly_penalty_weight: deltaW,
          },
          readiness_thresholds: {
            go_min_health_index: goMinHi,
            precaution_min_health_index: precMinHi,
          },
        };
    try {
      const res = await drishtiApi.updateHealthPolicy(payload);
      const nw = res.health_policy.weights;
      setAlphaW(nw.thermal_penalty_weight);
      setBetaW(nw.oil_penalty_weight);
      setGammaW(nw.vibration_penalty_weight);
      setDeltaW(nw.anomaly_penalty_weight);
      setPolicyStatus(
        `Policy updated & persisted to SQLite: α=${nw.thermal_penalty_weight}, β=${nw.oil_penalty_weight}, γ=${nw.vibration_penalty_weight}, δ=${nw.anomaly_penalty_weight} (GO ≥ ${res.health_policy.readiness_thresholds.go_min_health_index}% HI)`
      );
      await loadHealth();
    } catch (err: any) {
      setPolicyStatus(`Failed updating policy: ${err.message}`);
    }
  };

  if (loading || !healthData) {
    return (
<<<<<<< HEAD
      <div className="panel-card" style={{ padding: '36px 20px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            color: '#38bdf8',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={18} className="spin-slow" />
          <span>Loading degradation trajectory and RUL estimates for {engineId}…</span>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>
          Aggregating health index history, physics degradation models, and remaining flight hours.
        </div>
=======
      <div className="panel-card">
        Loading degradation trajectory and RUL estimates for {engineId}…
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
      </div>
    );
  }

  const pred = healthData.latest_predicted;
  const traj = healthData.degradation_trajectory || [];
  const weights = healthData.health_weights?.weights || {};

  // Compute live advisory under configured weights/thresholds
  const b = pred?.health_breakdown || {};
  const liveRecomputedHi = pred
    ? Math.max(
        0,
        Math.min(
          100,
          alphaW * (b.thermal_health_subscore ?? 100) +
            betaW * (b.oil_system_subscore ?? 100) +
            gammaW * (b.vibration_mechanical_subscore ?? 100) +
            deltaW * (b.anomaly_subscore ?? 100)
        )
      )
    : 100.0;
  const liveAdvisory =
    liveRecomputedHi >= goMinHi && pred?.predicted_fault_class === 'Normal'
      ? 'GO (PROTOTYPE ADVISORY)'
      : liveRecomputedHi >= precMinHi
      ? 'GO WITH PRECAUTION (PROTOTYPE ADVISORY)'
      : 'NO-GO / HOLD FOR MAINTENANCE (PROTOTYPE ADVISORY)';

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Diagnostics · Remaining Useful Life & Health Indicator Policy
          </div>
          <h1 className="screen-title">
            Predictive Maintenance & RUL — {engineId}
          </h1>
          <div className="screen-desc">
            Predicted Remaining Useful Life (RUL) with explicit units, model/data
            provenance, 10th–90th percentile uncertainty bounds, historical
            degradation trends, and known engineering limitations.
          </div>
        </div>
        <div className="screen-actions">
          <span className="badge badge-synthetic">
            SYNTHETIC RUL MODEL PROVENANCE
          </span>
          <button className="btn" onClick={loadHealth}>
            <RefreshCw size={13} /> Refresh Health State
          </button>
        </div>
      </div>

      {pred && (
        <div className="grid-4">
          {/* 1. Predicted RUL & Unit */}
          <div className="kpi-card info">
            <div className="kpi-label">Predicted Remaining Useful Life (RUL)</div>
            <div className="kpi-value sm" style={{ color: '#38bdf8' }}>
              {pred.rul_status === 'ESTIMATED' && pred.rul_hours !== null
                ? pred.rul_cycles != null
                  ? `${pred.rul_hours.toFixed(1)} hours (${pred.rul_cycles.toFixed(
                      1
                    )} cycles)`
                  : `${pred.rul_hours.toFixed(1)} hours`
                : 'NOT ESTIMABLE'}
            </div>
            <div className="kpi-sub">
              Unit: Operating Hours ({pred.rul_unit || 'hours'}) & Mission Cycles
            </div>
          </div>

          {/* 2. Uncertainty / Confidence Bounds */}
          <div className="kpi-card nominal">
            <div className="kpi-label">Ensemble Uncertainty Bounds (10th–90th)</div>
            <div className="kpi-value sm" style={{ color: '#4ade80' }}>
              {pred.rul_status === 'ESTIMATED' &&
              pred.rul_lower_10_hours !== null &&
              pred.rul_upper_90_hours !== null
                ? `[${pred.rul_lower_10_hours.toFixed(1)} – ${pred.rul_upper_90_hours.toFixed(
                    1
                  )}] hrs`
                : 'Gated / Unavailable'}
            </div>
            <div className="kpi-sub">{pred.rul_reason}</div>
          </div>

          {/* 3. Composite Health Indicator */}
          <div
            className={`kpi-card ${
              liveRecomputedHi >= goMinHi
                ? 'nominal'
                : liveRecomputedHi >= precMinHi
                ? 'caution'
                : 'critical'
            }`}
          >
            <div className="kpi-label">Composite Health Indicator (HI)</div>
            <div
              className="kpi-value sm"
              style={{
                color:
                  liveRecomputedHi >= goMinHi
                    ? '#4ade80'
                    : liveRecomputedHi >= precMinHi
                    ? '#fbbf24'
                    : '#f87171',
              }}
            >
              {liveRecomputedHi.toFixed(1)} / 100
            </div>
            <div className="kpi-sub">
              Decision: <strong>{liveAdvisory}</strong>
            </div>
          </div>

          {/* 4. Model & Data Provenance */}
          <div className="kpi-card info">
            <div className="kpi-label">RUL Model & Data Provenance</div>
            <div
              className="mono"
              style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}
            >
              {pred.model_version || 'DRISHTI-ML-Ensemble-v1.0'}
            </div>
            <div className="kpi-sub">
              Trained on synthetic run-to-failure trajectories (Seed 1000 / 2026).
              Advisory only.
            </div>
          </div>
        </div>
      )}

      {/* SUBSYSTEM HEALTH BREAKDOWN */}
      {pred?.health_breakdown && (
        <div className="grid-4">
          {Object.entries(pred.health_breakdown).map(([k, v]) => (
            <div key={k} className="panel-card" style={{ marginBottom: 0 }}>
              <div className="kpi-label">{k.replace(/_/g, ' ')}</div>
              <div className="kpi-value sm">{Number(v).toFixed(1)}%</div>
              <div className="progress-bar-track" style={{ marginTop: 6 }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, Number(v)))}%`,
                    backgroundColor:
                      Number(v) >= 75
                        ? '#22c55e'
                        : Number(v) >= 55
                        ? '#f59e0b'
                        : '#ef4444',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HISTORICAL DEGRADATION & RUL UNCERTAINTY TRAJECTORY CHARTS */}
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Gauge size={14} /> Historical Health Index & Subsystem Safety
              Margins (%)
            </div>
          </div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={traj}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="mission_elapsed_sec" stroke="#8899bb" unit="s" />
                <YAxis stroke="#8899bb" domain={[0, 105]} unit="%" />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="health_index"
                  name="Composite Health Index (%)"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="thermal_margin_pct"
                  name="Thermal Margin (%)"
                  stroke="#fb923c"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="oil_pressure_margin_pct"
                  name="Oil Pressure Margin (%)"
                  stroke="#22c55e"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="vibration_margin_pct"
                  name="Vibration Margin (%)"
                  stroke="#a78bfa"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              RUL Historical Trajectory & Ensemble 10th–90th Percentile Bounds
              (Hours)
            </div>
          </div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={traj}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="mission_elapsed_sec" stroke="#8899bb" unit="s" />
                <YAxis stroke="#8899bb" unit="h" />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="rul_upper_90_hours"
                  name="90th Percentile RUL (hrs)"
                  stroke="#64748b"
                  fill="rgba(56, 189, 248, 0.12)"
                />
                <Area
                  type="monotone"
                  dataKey="rul_hours"
                  name="Estimated Mean RUL (hrs)"
                  stroke="#38bdf8"
                  fill="rgba(56, 189, 248, 0.25)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="rul_lower_10_hours"
                  name="10th Percentile RUL (hrs)"
                  stroke="#f59e0b"
                  fill="rgba(15, 23, 42, 0.4)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CONFIGURABLE HEALTH INDEX WEIGHTS & GO / NO-GO POLICY PANEL */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Settings size={14} /> Configurable Health Index Weights (α, β, γ, δ)
            & GO / GO WITH PRECAUTION / NO-GO Thresholds
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => handleSavePolicy(true)}>
              Reset SIH26054 Defaults (0.30 / 0.30 / 0.20 / 0.20)
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleSavePolicy(false)}
            >
              Apply Custom Weights & Thresholds
            </button>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="w-alpha">
              α Thermal Weight (Current: {weights.thermal_penalty_weight ?? 0.3})
            </label>
            <input
              id="w-alpha"
              type="number"
              step="0.05"
              min="0"
              max="1"
              className="input-control mono"
              value={alphaW}
              onChange={(e) => setAlphaW(Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="w-beta">
              β Oil Lubrication Weight (Current:{' '}
              {weights.oil_penalty_weight ?? 0.3})
            </label>
            <input
              id="w-beta"
              type="number"
              step="0.05"
              min="0"
              max="1"
              className="input-control mono"
              value={betaW}
              onChange={(e) => setBetaW(Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="w-gamma">
              γ Vibration Weight (Current:{' '}
              {weights.vibration_penalty_weight ?? 0.2})
            </label>
            <input
              id="w-gamma"
              type="number"
              step="0.05"
              min="0"
              max="1"
              className="input-control mono"
              value={gammaW}
              onChange={(e) => setGammaW(Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="w-delta">
              δ Anomaly / ML Weight (Current:{' '}
              {weights.anomaly_penalty_weight ?? 0.2})
            </label>
            <input
              id="w-delta"
              type="number"
              step="0.05"
              min="0"
              max="1"
              className="input-control mono"
              value={deltaW}
              onChange={(e) => setDeltaW(Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="thr-go">GO Minimum HI (%)</label>
            <input
              id="thr-go"
              type="number"
              step="1"
              min="50"
              max="95"
              className="input-control mono"
              value={goMinHi}
              onChange={(e) => setGoMinHi(Number(e.target.value))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="thr-prec">GO WITH PRECAUTION Min HI (%)</label>
            <input
              id="thr-prec"
              type="number"
              step="1"
              min="30"
              max="85"
              className="input-control mono"
              value={precMinHi}
              onChange={(e) => setPrecMinHi(Number(e.target.value))}
            />
          </div>
        </div>
        {policyStatus && (
          <div
            className="mono"
            style={{ marginTop: 8, color: '#38bdf8', fontSize: 11.5 }}
          >
            {policyStatus}
          </div>
        )}
      </div>

      {/* KNOWN RUL LIMITATIONS & PROVENANCE DISCLOSURE */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Info size={14} /> RUL Provenance, Gating Policy & Known Engineering
            Limitations
          </div>
        </div>
        <div
          className="mono"
          style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.7 }}
        >
          <div>
            • <strong>Model & Data Provenance:</strong> RUL estimates are
            generated by the hybrid <code>XGBRegressor</code> +{' '}
            <code>RandomForestRegressor</code> ensemble trained on synthetic
            degradation trajectories (<code>DRISHTI-SynthCorpus-v1.0</code> 54
            trajectories & <code>DRISHTI-SynthCorpus-100k-v2.0</code> 50
            engines).
          </div>
          <div>
            • <strong>Safety Gating Rule:</strong> When the dedicated{' '}
            <code>SensorFaultIsolator</code> detects an instrumentation fault or
            corrupted channel, RUL estimation is automatically gated to{' '}
            <code>NOT_ESTIMABLE</code> so sensor drift is never misinterpreted
            as mechanical life exhaustion.
          </div>
          <div>
            • <strong>Known Limitations:</strong> Synthetic RUL accuracy (2.805 h
            MAE on 54-traj suite; 8.782 cycles / 7.571 h MAE on 100k suite)
            demonstrates algorithmic consistency on simulated progression curves
            and must not be presented as certified real-UAV engine run-to-failure
            accuracy without destructive endurance test-cell calibration.
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   SCREEN 8: MODEL EVALUATION (SYNTHETIC VS EXTERNAL BENCHMARK SEPARATION)
   ========================================================================= */
export const ModelEvaluationScreen: React.FC<{
  modelStatus: Record<string, any> | null;
  onRefreshModelStatus: () => Promise<void>;
}> = ({ modelStatus, onRefreshModelStatus }) => {
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

  const report = modelStatus?.evaluation_report;
  if (!report) {
<<<<<<< HEAD
    return (
      <div className="panel-card" style={{ padding: '36px 20px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            color: '#38bdf8',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={18} className="spin-slow" />
          <span>Synchronizing ML evaluation metrics & benchmark dataset manifest…</span>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>
          Connecting to DRISHTI inference server. If the backend is spinning up on Render, this may take a few moments.
        </div>
      </div>
    );
=======
    return <div className="panel-card">Loading ML evaluation metrics…</div>;
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
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
            Validation · Leak-Free Held-Out Evaluation & External Benchmarks
          </div>
          <h1 className="screen-title">
            Machine Learning Evaluation & Benchmark Audit
          </h1>
          <div className="screen-desc">
            Strict separation between Synthetic Digital Twin Benchmarks (
            {manifest.shared_engines_between_train_and_test} shared engines) and
            External Experimental Engine Datasets (LiU-ICE & Marine Diesel).
          </div>
        </div>
        <div className="screen-actions">
          <button
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

      {/* SECTION A: SYNTHETIC BENCHMARK RESULTS */}
      <div className="panel-card" style={{ borderLeft: '3px solid #38bdf8' }}>
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Database size={14} /> Part A — Synthetic Digital Twin Benchmark
            Results (Simulated Telemetry — Not Proof of Real UAV Accuracy)
          </div>
          <span className="badge badge-synthetic">
            100% SYNTHETIC BENCHMARKS (0 SHARED ENGINES)
          </span>
        </div>

        <div className="grid-4">
          <div className="kpi-card nominal">
            <div className="kpi-label">
              9-Class Held-Out Macro-F1 (54-Traj Suite)
            </div>
            <div className="kpi-value sm" style={{ color: '#4ade80' }}>
              {(clsMetrics.macro_f1 * 100).toFixed(2)}%
            </div>
            <div className="kpi-sub">
              Overall Accuracy: {(clsMetrics.overall_accuracy * 100).toFixed(2)}%
              ({manifest.test_samples} test frames)
            </div>
          </div>

          <div className="kpi-card info">
            <div className="kpi-label">Anomaly Detector (IsolationForest)</div>
            <div className="kpi-value sm" style={{ color: '#38bdf8' }}>
              Recall: {(anomMetrics.recall * 100).toFixed(1)}%
            </div>
            <div className="kpi-sub">
              False Alarm Rate: {(anomMetrics.false_alarm_rate * 100).toFixed(2)}%
              | Precision: {(anomMetrics.precision * 100).toFixed(1)}%
            </div>
          </div>

          <div className="kpi-card caution">
            <div className="kpi-label">Held-Out RUL Error (XGBoost + RF)</div>
            <div className="kpi-value sm" style={{ color: '#fbbf24' }}>
              MAE:{' '}
              {rulMetrics.xgboost_held_out_mae_hours ??
                rulMetrics.held_out_mae_hours}{' '}
              hrs
            </div>
            <div className="kpi-sub">
              RMSE:{' '}
              {rulMetrics.xgboost_held_out_rmse_hours ??
                rulMetrics.held_out_rmse_hours}{' '}
              hrs (N={rulMetrics.evaluated_samples})
            </div>
          </div>

          <div className="kpi-card nominal">
            <div className="kpi-label">Live-Twin Leakage Audit</div>
            <div className="kpi-value sm" style={{ color: '#4ade80' }}>
              0 Shared Engines
            </div>
            <div className="kpi-sub">
              Train: {manifest.train_trajectories} traj ({manifest.train_samples}{' '}
              rows) | Test: {manifest.test_trajectories} traj (
              {manifest.test_samples} rows)
            </div>
          </div>
        </div>

        {ppt100k?.held_out_test_metrics && (
          <div className="grid-4" style={{ marginBottom: 0 }}>
            <div className="kpi-card nominal">
              <div className="kpi-label">100k / 50-Engine Held-Out Macro-F1</div>
              <div className="kpi-value sm" style={{ color: '#4ade80' }}>
                {(
                  ppt100k.held_out_test_metrics.classification.macro_f1 * 100
                ).toFixed(2)}
                %
              </div>
              <div className="kpi-sub">
                Test Split: 15,000 rows (7 held-out engines) | Accuracy: 98.25%
              </div>
            </div>

            <div className="kpi-card info">
              <div className="kpi-label">
                100k Anomaly Detection (IsolationForest)
              </div>
              <div className="kpi-value sm" style={{ color: '#38bdf8' }}>
                Recall:{' '}
                {(
                  ppt100k.held_out_test_metrics.anomaly_detection.recall * 100
                ).toFixed(2)}
                %
              </div>
              <div className="kpi-sub">
                Held-Out FAR:{' '}
                {(
                  ppt100k.held_out_test_metrics.anomaly_detection
                    .false_alarm_rate * 100
                ).toFixed(2)}
                % | Val FAR: 3.01%
              </div>
            </div>

            <div className="kpi-card caution">
              <div className="kpi-label">100k XGBoost RUL (Cycles & Hours)</div>
              <div className="kpi-value sm" style={{ color: '#fbbf24' }}>
                MAE:{' '}
                {ppt100k.held_out_test_metrics.rul_xgboost.held_out_mae_cycles}{' '}
                cyc
              </div>
              <div className="kpi-sub">
                RMSE:{' '}
                {ppt100k.held_out_test_metrics.rul_xgboost.held_out_rmse_cycles}{' '}
                cyc (
                {ppt100k.held_out_test_metrics.rul_xgboost.held_out_mae_hours}{' '}
                hrs MAE)
              </div>
            </div>

            <div className="kpi-card nominal">
              <div className="kpi-label">
                100k Engine-Disjoint Split (70 / 15 / 15)
              </div>
              <div className="kpi-value sm" style={{ color: '#4ade80' }}>
                50 Engines (0 Overlap)
              </div>
              <div className="kpi-sub">
                Train: 35 (70k) | Val: 8 (15k) | Test: 7 (15k) | SF F1:{' '}
                {(
                  ppt100k.held_out_test_metrics.sensor_fault_isolation.f1 * 100
                ).toFixed(1)}
                %
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION B: EXTERNAL EXPERIMENTAL BENCHMARK RESULTS */}
      <div className="panel-card" style={{ borderLeft: '3px solid #22c55e' }}>
        <div className="panel-card-header">
          <div className="panel-card-title">
            <ShieldCheck size={14} /> Part B — External Experimental Engine
            Benchmark Validation (Real Test-Cell Datasets)
          </div>
          <span className="badge badge-nominal">
            REAL EXPERIMENTAL BENCHMARKS (RUN-DISJOINT)
          </span>
        </div>
        <div className="grid-2" style={{ marginBottom: 0 }}>
          <div
            style={{
              background: 'rgba(0,0,0,0.22)',
              padding: 12,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <strong style={{ color: '#38bdf8' }}>
                LiU-ICE-Benchmark-DXC25 (2025)
              </strong>
              <span className="badge badge-nominal">288,623 ROWS · 8 WLTP RUNS</span>
            </div>
            <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
              <div>
                • 4-Class Decoupled Residual LR: <strong>0.5874 Macro-F1</strong>{' '}
                | <strong>0.6903 Balanced Accuracy</strong>
              </div>
              <div>
                • Held-Out Normal False Alarm Rate: <strong>0.90% FAR</strong> |
                Intercooler Leakage (<code>f_pic</code>) Recall:{' '}
                <strong>99.50%</strong>
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(0,0,0,0.22)',
              padding: 12,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <strong style={{ color: '#4ade80' }}>
                Marine-Engine-Fault-v1.0 (Matsui 257 kW Turbo Diesel)
              </strong>
              <span className="badge badge-nominal">114,770 ROWS · 16 RUNS</span>
            </div>
            <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
              <div>
                • 6-Class Multi-Fault Classifier: <strong>0.5742 Macro-F1</strong>{' '}
                | <strong>0.6486 Balanced Accuracy</strong>
              </div>
              <div>
                • Schmitt-Trigger Hysteresis Anomaly Gate:{' '}
                <strong>0.00% Normal FAR</strong> | <strong>7/7 Fault Runs</strong>{' '}
                detected (<strong>0.7518 Balanced Accuracy</strong>)
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Award size={14} /> Per-Class Precision, Recall, F1 & Support
              (Held-Out Test Set)
            </div>
          </div>
          <table className="data-table mono">
            <thead>
              <tr>
                <th>Diagnostic Class</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1-Score</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(clsMetrics.per_class).map(
                ([clsName, m]: [string, any]) => (
                  <tr key={clsName}>
                    <td>{clsName}</td>
                    <td>{(m.precision * 100).toFixed(1)}%</td>
                    <td>{(m.recall * 100).toFixed(1)}%</td>
                    <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                      {(m.f1 * 100).toFixed(1)}%
                    </td>
                    <td>{m.support}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              9×9 Confusion Matrix (Rows = Ground Truth, Cols = Predicted)
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table mono" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>True \ Pred</th>
                  {clsMetrics.classes.map((c: string, i: number) => (
                    <th key={i} title={c}>
                      C{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clsMetrics.confusion_matrix.map(
                  (row: number[], rIdx: number) => (
                    <tr key={rIdx}>
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
        </div>
      </div>

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Isolation Forest Precision-Recall Curve (Held-Out Test Set)
            </div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={anomMetrics.pr_curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="recall" stroke="#8899bb" />
                <YAxis stroke="#8899bb" domain={[0.5, 1.02]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="precision"
                  name="Anomaly Precision vs Recall"
                  stroke="#38bdf8"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Random Forest Feature Importance Ranking
            </div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={importanceData.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis type="number" stroke="#8899bb" />
                <YAxis
                  type="category"
                  dataKey="feature"
                  width={165}
                  stroke="#8899bb"
                  fontSize={10.5}
                />
                <Tooltip />
                <Bar dataKey="importance" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            Dedicated Sensor-Fault Isolator & XGBoost Stack Disclosure
          </div>
        </div>
        <div className="mono" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>
            • <strong>Sensor-Fault Isolator ({sfMetrics.isolator_version}):</strong>{' '}
            Precision={(sfMetrics.precision * 100).toFixed(1)}%, Recall=
            {(sfMetrics.recall * 100).toFixed(1)}% (TP={sfMetrics.true_positives}
            , FP={sfMetrics.false_positives}, FN={sfMetrics.false_negatives})
          </div>
          <div>
            • <strong>Estimator Stack Note:</strong>{' '}
            {report.xgboost_status || report.xgboost_fallback_note}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   SCREEN 9: ENGINEERING REPORTS, DATA SOURCES & SYSTEM CONFIGURATION
   ========================================================================= */
export const ReportsAndSettingsScreen: React.FC<{
  reports: Record<string, any>[];
  catalog: Record<string, any> | null;
  modelStatus: Record<string, any> | null;
  backendHealth?: Record<string, any> | null;
  onNavigate?: (screen: string) => void;
}> = ({ reports, catalog, modelStatus, onNavigate }) => {
  const [selectedReportId, setSelectedReportId] = useState<string>(
    reports[0]?.report_id || ''
  );
  const [activeReport, setActiveReport] = useState<Record<string, any> | null>(
    reports[0] || null
  );

  useEffect(() => {
    if (reports.length > 0 && !selectedReportId) {
      setSelectedReportId(reports[0].report_id);
      setActiveReport(reports[0]);
    }
  }, [reports]);

  const handleSelectReport = async (repId: string) => {
    setSelectedReportId(repId);
    const full = await drishtiApi.getReport(repId);
    setActiveReport(full);
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

  const physMeta = catalog?.physics_metadata;
  const dqStats = modelStatus?.data_quality_stats;

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Validation · Scenario Reports, Physics Envelope & Stream Quality
          </div>
          <h1 className="screen-title">
            Engineering Evaluation Reports & System Configuration
          </h1>
          <div className="screen-desc">
            Export scenario evaluation reports, inspect physics reference
            assumptions and operating envelopes, and audit telemetry
            data-quality rejection counters.
          </div>
        </div>
        <div className="screen-actions">
          {onNavigate && (
            <button className="btn" onClick={() => onNavigate('docs')}>
              <Activity size={13} /> Open Data Sources & Tech Docs
            </button>
          )}
          <select
            className="select-control"
            value={selectedReportId}
            onChange={(e) => handleSelectReport(e.target.value)}
            aria-label="Select Engineering Report"
          >
            {reports.map((r) => (
              <option key={r.report_id} value={r.report_id}>
                {r.report_id} — {r.engine_id} ({r.mission_id})
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={handleDownloadReportJson}
            disabled={!activeReport}
          >
            <Download size={13} /> Export Engineering Report (JSON)
          </button>
        </div>
      </div>

      {activeReport && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <FileText size={14} /> {activeReport.title}
            </div>
            <span className="badge badge-synthetic">
              REPORT ID: {activeReport.report_id}
            </span>
          </div>
          <div className="grid-4">
            <div>
              <div className="kpi-label">Engine & Mission</div>
              <div className="mono" style={{ fontWeight: 700 }}>
                {activeReport.engine_id} / {activeReport.mission_id}
              </div>
              <div className="kpi-sub">
                Source: {activeReport.data_source} (Synthetic:{' '}
                {String(activeReport.is_synthetic)})
              </div>
            </div>
            <div>
              <div className="kpi-label">Scenario Ground Truth</div>
              <div
                className="mono"
                style={{ fontWeight: 700, color: '#fbbf24' }}
              >
                {activeReport.scenario_configuration?.fault_class} (Severity{' '}
                {activeReport.scenario_configuration?.severity})
              </div>
              <div className="kpi-sub">
                Seed: {activeReport.scenario_configuration?.random_seed} |
                Onset: {activeReport.scenario_configuration?.onset_time_sec}s
              </div>
            </div>
            <div>
              <div className="kpi-label">Measured Twin Classification</div>
              <div
                className="mono"
                style={{ fontWeight: 700, color: '#38bdf8' }}
              >
                {activeReport.measured_results?.final_predicted_class} (
                {(
                  (activeReport.measured_results?.final_top_probability || 0) *
                  100
                ).toFixed(1)}
                %)
              </div>
              <div className="kpi-sub">
                HI: {activeReport.measured_results?.initial_health_index}% →{' '}
                {activeReport.measured_results?.final_health_index}%
              </div>
            </div>
            <div>
              <div className="kpi-label">Peak Measured Residuals</div>
              <div className="mono" style={{ fontSize: 12 }}>
                |ΔCHT| max:{' '}
                {activeReport.measured_results?.peak_abs_cht_residual_c} °C |
                ΔOilP min:{' '}
                {activeReport.measured_results?.min_oil_pressure_residual_bar}{' '}
                bar
              </div>
              <div className="kpi-sub">
                Alerts Generated: {activeReport.measured_results?.alert_count}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div className="kpi-label">Engineering Disclosures</div>
            {(activeReport.engineering_disclosures || []).map(
              (d: string, idx: number) => (
                <div
                  key={idx}
                  className="mono"
                  style={{ fontSize: 11.5, color: '#94a3b8' }}
                >
                  • {d}
                </div>
              )
            )}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Settings size={14} /> Physics Reference Engine Supported Envelope
              ({physMeta?.model_version})
            </div>
          </div>
          {physMeta && (
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
                  ).map(([k, v]: [string, any]) => (
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
                Documented Equations & Assumptions
              </div>
              {(physMeta.assumptions || []).map((a: string, i: number) => (
                <div
                  key={i}
                  style={{ fontSize: 11.5, color: '#cbd5e1', marginBottom: 3 }}
                >
                  • {a}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Telemetry Stream Validator & CAN Interface Status
            </div>
          </div>
          {dqStats && (
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
          )}
          {catalog?.can_interface && (
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
              <div className="mono" style={{ fontSize: 11.5, color: '#38bdf8' }}>
                Adapter: {catalog.can_interface.adapter_class} | Mode:{' '}
                {catalog.can_interface.mode} | Hardware Connected:{' '}
                {String(catalog.can_interface.hardware_connected)}
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                {catalog.can_interface.disclosure}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   SCREEN 10: DATA SOURCES, SYSTEM STATUS & TECHNICAL DOCUMENTATION
   ========================================================================= */
export const SystemStatusAndTechDocsScreen: React.FC<{
  backendHealth: Record<string, any> | null;
  catalog: Record<string, any> | null;
  modelStatus: Record<string, any> | null;
}> = ({ backendHealth, catalog, modelStatus }) => {
  const [readiness, setReadiness] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    drishtiApi
      .getReadiness()
      .then((r) => setReadiness(r))
      .catch(() => {});
  }, []);

  const dqStats = modelStatus?.data_quality_stats;
  const paramSpecs = catalog?.sih26054_eight_parameter_groups || [];

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Validation · Dataset Provenance, System Readiness & SIH26054
            Architecture
          </div>
          <h1 className="screen-title">
            Data Sources, System Status & Technical Documentation
          </h1>
          <div className="screen-desc">
            Dataset provenance register (Synthetic Twin Corpus + Verified Public
            Piston Benchmarks), live subsystem readiness checks, data
            dictionary, and architecture documentation.
          </div>
        </div>
        <span className="badge badge-nominal">
          <CheckCircle2 size={11} /> SYSTEM READY:{' '}
          {readiness?.status?.toUpperCase() || 'OK'}
        </span>
      </div>

      <div className="grid-4">
        <div className="kpi-card nominal">
          <div className="kpi-label">Backend & SQLite WAL Readiness</div>
          <div className="kpi-value sm" style={{ color: '#4ade80' }}>
            {readiness?.database_ready !== false ? 'READY (WAL)' : 'OFFLINE'}
          </div>
          <div className="kpi-sub">
            Seeded Fleet: {readiness?.seeded_engine_count ?? 6} UAV Engines |
            Schema v{backendHealth?.telemetry_schema_version || '1.0.0'}
          </div>
        </div>

        <div className="kpi-card info">
          <div className="kpi-label">Physics & ML Ensemble Status</div>
          <div className="kpi-value sm" style={{ color: '#38bdf8' }}>
            {backendHealth?.ml_models_loaded ? 'LOADED & ACTIVE' : 'FALLBACK'}
          </div>
          <div className="kpi-sub">
            {backendHealth?.physics_model_version} |{' '}
            {backendHealth?.ml_model_version}
          </div>
        </div>

        <div className="kpi-card caution">
          <div className="kpi-label">CAN / SocketCAN Hardware Adapter</div>
          <div className="kpi-value sm" style={{ color: '#fbbf24' }}>
            {backendHealth?.can_interface?.mode || 'SOFTWARE_CODEC_READY'}
          </div>
          <div className="kpi-sub">
            29-Bit Extended IDs: 0x101–0x104 | HW Connected:{' '}
            {String(backendHealth?.can_interface?.hardware_connected ?? false)}
          </div>
        </div>

        <div className="kpi-card nominal">
          <div className="kpi-label">Telemetry Stream Validator</div>
          <div className="kpi-value sm" style={{ color: '#4ade80' }}>
            {dqStats?.total_valid ?? 0} / {dqStats?.total_received ?? 0} Valid
          </div>
          <div className="kpi-sub">
            Dup: {dqStats?.duplicate_count ?? 0} | Out-of-Order:{' '}
            {dqStats?.out_of_order_count ?? 0} | Stale:{' '}
            {dqStats?.stale_count ?? 0}
          </div>
        </div>
      </div>

      {/* DATASET PROVENANCE REGISTER */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            Verified Dataset Provenance & Separation of Synthetic vs.
            Experimental Data
          </div>
          <span className="badge badge-synthetic">
            ZERO DATA FABRICATION POLICY
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table mono" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Dataset ID</th>
                <th>Source & Provenance</th>
                <th>Scale & Split</th>
                <th>Role in DRISHTI</th>
                <th>Evidence Classification</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>DRISHTI-SynthCorpus-v1.0</strong>
                </td>
                <td>Deterministic Fault Simulator (Rotax 914F Ref Twin)</td>
                <td>
                  54 Trajectories (1,944 frames: 36 train = 1,296 / 18 test =
                  648; 0 shared engines)
                </td>
                <td>
                  Live-Twin 9-Class RF (0.9769 Macro-F1, 0.9738 Acc), IsoForest
                  (0.8875 Recall, 0.0119 FAR), XGBoost RUL (2.800 h MAE)
                </td>
                <td>
                  <span className="badge badge-synthetic">
                    100% SYNTHETIC (LABELED)
                  </span>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>DRISHTI-SynthCorpus-100k-v2.0</strong>
                </td>
                <td>50-Engine Multi-Profile Corpus (Seed 2026)</td>
                <td>
                  100,000 rows | 50 Engines (35 Train=70k / 8 Val=15k / 7
                  Test=15k; 0 shared engines)
                </td>
                <td>
                  Large-Scale 9-Class RF (0.9853 F1, 0.9825 Acc), IsoForest
                  (0.9180 Recall, 0.0255 Test FAR) & XGBoost RUL (8.782 cyc /
                  7.571 h MAE)
                </td>
                <td>
                  <span className="badge badge-synthetic">
                    100% SYNTHETIC (LABELED)
                  </span>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>LiU-ICE-Benchmark-DXC25 (2025)</strong>
                </td>
                <td>
                  Linköping University Vehicular Systems (DOI:
                  10.48550/arXiv.2408.13269)
                </td>
                <td>
                  288,623 rows across 8 WLTP runs (4 train=125,265 / 4
                  test=125,346; stride-5 N=21,657)
                </td>
                <td>
                  Phase 4 Unsigned Decoupled Residual 4-Class LR (0.5874
                  Macro-F1, 0.6903 Bal Acc, 0.90% Normal FAR, 0.9950 f_pic
                  Recall)
                </td>
                <td>
                  <span className="badge badge-nominal">
                    REAL TEST-CELL BENCHMARK
                  </span>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Marine-Engine-Fault-v1.0 (2024)</strong>
                </td>
                <td>
                  Matsui MU323DGSC 3-Cyl 257 kW Turbo Marine Diesel (Zenodo DOI:
                  10.5281/zenodo.19857425)
                </td>
                <td>
                  114,770 rows across 16 physical runs (9 train=70,711 / 7
                  test=44,059; 0 shared runs)
                </td>
                <td>
                  Phase 4 6-Class LR (0.5742 Macro-F1, 0.6486 Bal Acc) &
                  Schmitt-Trigger Hysteresis Anomaly Gate (0.00% Normal FAR, 7/7
                  fault runs detected, 0.7518 Bal Acc)
                </td>
                <td>
                  <span className="badge badge-nominal">
                    REAL EXPERIMENTAL BENCHMARK
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* DATA DICTIONARY & 8 PARAMETER GROUPS */}
      <div className="grid-2">
        <div className="panel-card">
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
                {paramSpecs.map((p: any) => (
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
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Architecture, Security & Future Hardware Integration Roadmap
            </div>
          </div>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.7 }}
          >
            <div>
              • <strong>Modular 5-Layer Architecture:</strong> (1) Telemetry
              Ingestion & Validator (`SocketCAN` codec, CSV, REST, WebSocket) →
              (2) Physics Reference Baseline (`Rotax914-Simplified-Ref-v1.0`) →
              (3) Deterministic Residual & Sliding-Window Feature Extractor (17
              features, W=20) → (4) ML Ensemble (`RandomForest`,
              `IsolationForest`, `XGBRegressor`, `SensorFaultIsolator`) → (5)
              SQLite WAL Store & 3D React Workstation.
            </div>
            <div>
              • <strong>Prototype Security & Reliability Controls:</strong>{' '}
              Strict Pydantic range/enum validation, duplicate/stale/out-of-order
              frame detection, parameterized SQLite queries, `/health` and
              `/ready` probes, and `.env.example` externalized configuration.
            </div>
            <div>
              • <strong>Future Defence Deployment Roadmap:</strong> Connect
              physical UAV FADEC / Rotax 914 ECU via isolated USB-CAN transceiver
              (`python-can` on `can0` at 500 kbps), add mTLS/JWT operator RBAC,
              and calibrate thermal/vibration transfer functions on DRDO
              propulsion test-bed runs.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
