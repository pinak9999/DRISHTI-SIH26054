import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  HelpCircle,
  Info,
  Layers,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { drishtiApi } from '../../api/client';
import {
  EmptyState,
  GlassPanel,
  KpiTile,
  SeverityBadge,
  Skeleton,
  StatusChip,
  SyntheticBadge,
} from '../../components/ui';
import {
  ExplainableAlert,
  FourValueDigitalTwinState,
} from '../../types/telemetry';

export interface FaultInvestigationScreenProps {
  engineId: string;
  latestState: FourValueDigitalTwinState | null;
  alerts: ExplainableAlert[];
  catalog?: Record<string, any> | null;
  onRefreshEngine: () => Promise<void>;
  backendError?: string | null;
}

export function mapFaultToSubsystemName(faultClass: string): string {
  switch (faultClass) {
    case 'Cylinder Overheating':
    case 'Valve Clearance Issue':
      return 'SUB-05 · Cylinder Heads, Valvetrain & Cooling Plenum';
    case 'Oil Pressure Drop':
      return 'SUB-07 · Dry-Sump Lubrication & Oil Cooler Circuit';
    case 'Crankshaft Bearing Wear':
      return 'SUB-02 · Crankshaft Journals & Reduction Gearbox';
    case 'Piston Ring Wear':
    case 'Cylinder Misfire':
      return 'SUB-03/04 · Horizontally-Opposed Power Cylinders';
    case 'Fuel Injector Clogging':
      return 'SUB-08 · Electronic Fuel Injection Rail & Nozzles';
    case 'Sensor Fault':
      return 'SUB-10 · FADEC Sensor Harness & Instrumentation';
    default:
      return 'Nominal Propulsion Assembly (All Subsystems Within Envelope)';
  }
}

export function getSeverityClass(sev: string): string {
  const s = sev.toLowerCase();
  if (s === 'critical') return 'severity-critical';
  if (s === 'warning') return 'severity-warning';
  if (s === 'caution') return 'severity-caution';
  return 'severity-nominal';
}

interface ModelStatusResponse {
  ml_loaded?: boolean;
  ml_model_version?: string;
  evaluation_report?: {
    model_version?: string;
    classifier_held_out_macro_f1?: number;
    feature_importances?: Record<string, number>;
  };
}

export const FaultInvestigationScreen: React.FC<FaultInvestigationScreenProps> = ({
  engineId,
  latestState,
  alerts,
  catalog,
  onRefreshEngine,
  backendError = null,
}) => {
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);
  const [modelLoading, setModelLoading] = useState<boolean>(true);
  const [showCatalogMatrix, setShowCatalogMatrix] = useState<boolean>(false);
  const [ackLoadingId, setAckLoadingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Fetch global model status (feature importances, macro F1, model version)
  useEffect(() => {
    let isMounted = true;
    const fetchModelStatus = async () => {
      try {
        const data = await drishtiApi.getModelStatus();
        if (isMounted) {
          setModelStatus(data as ModelStatusResponse);
        }
      } catch {
        // Handled gracefully; feature importances will show fallback or empty
      } finally {
        if (isMounted) {
          setModelLoading(false);
        }
      }
    };
    fetchModelStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshEngine();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string, currentAck: boolean) => {
    setAckLoadingId(alertId);
    try {
      await drishtiApi.acknowledgeAlert(alertId, !currentAck);
      await onRefreshEngine();
    } catch {
      // Silently catch or handle
    } finally {
      setAckLoadingId(null);
    }
  };

  // 1. Ranked 9-class posterior probabilities
  const rankedProbabilities = useMemo(() => {
    if (!latestState?.predicted?.class_probabilities) return [];
    return Object.entries(latestState.predicted.class_probabilities)
      .map(([fault_class, probability]) => ({
        fault_class,
        probability,
        pct: Number((probability * 100).toFixed(1)),
      }))
      .sort((a, b) => b.probability - a.probability);
  }, [latestState?.predicted?.class_probabilities]);

  // 2. Global feature importances from /api/model-status (NO SHAP)
  const rankedFeatureImportances = useMemo(() => {
    const importances = modelStatus?.evaluation_report?.feature_importances;
    if (!importances) return [];
    return Object.entries(importances)
      .map(([feature, weight]) => ({
        feature,
        weight: Number(weight),
        pct: Number((weight * 100).toFixed(1)),
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [modelStatus?.evaluation_report?.feature_importances]);

  // --- STATE 1: BACKEND OFFLINE ---
  if (backendError && !latestState) {
    return (
      <div className="faults-workspace">
        <EmptyState
          title="Propulsion Diagnostics Server Unreachable"
          description={`Unable to retrieve telemetry or fault classifications for engine ${engineId}. DRISHTI backend may be starting or offline.`}
          action={
            <button className="btn btn-sm" onClick={handleManualRefresh}>
              Retry Engine Diagnostic Connection
            </button>
          }
        />
      </div>
    );
  }

  // --- STATE 2: LOADING SKELETON ---
  if (!latestState) {
    return (
      <div className="faults-workspace">
        <div className="screen-header">
          <div className="screen-title-block">
            <Skeleton variant="text" width={220} height={14} />
            <Skeleton variant="text" width={380} height={28} />
            <Skeleton variant="text" width={520} height={14} />
          </div>
        </div>
        <div className="faults-kpi-grid">
          <Skeleton variant="rect" height={100} count={4} />
        </div>
        <div className="faults-main-grid" style={{ marginTop: 14 }}>
          <Skeleton variant="rect" height={360} count={2} />
        </div>
        <div className="faults-alerts-grid" style={{ marginTop: 14 }}>
          <Skeleton variant="rect" height={280} count={1} />
        </div>
      </div>
    );
  }

  const sDiag = latestState.predicted.sensor_diagnosis;
  const affectedSubsystem = mapFaultToSubsystemName(
    latestState.predicted.predicted_fault_class
  );
  const activeFault = latestState.predicted.predicted_fault_class;
  const isAnomaly = latestState.predicted.is_anomaly;

  return (
    <div className="faults-workspace">
      {/* SCREEN HEADER */}
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Diagnostics · 9-Class Ensemble & Sensor-Fault Isolation
          </div>
          <h1 className="screen-title">
            Fault Investigation & Root-Cause Evidence — {engineId}
          </h1>
          <div className="screen-desc">
            9-Class Random Forest posterior distribution, Isolation Forest anomaly scoring,
            cross-channel Sensor-Fault Isolator, and explainable decision support.
          </div>
        </div>
        <div className="screen-actions">
          <SyntheticBadge isSynthetic={latestState.is_synthetic} />
          <button
            className="btn btn-sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh Diagnostic Telemetry"
          >
            <RefreshCw size={13} className={refreshing ? 'spin-slow' : ''} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh Telemetry'}</span>
          </button>
        </div>
      </div>

      {/* ROW 1: 4 TOP KPI TILES */}
      <div className="faults-kpi-grid">
        <KpiTile
          label="Primary Diagnostic Classification"
          value={activeFault}
          subtext={`Confidence: ${(latestState.predicted.top_probability * 100).toFixed(1)}% · ${latestState.predicted.diagnosis_certainty_status}`}
          status={
            activeFault === 'Normal'
              ? 'nominal'
              : latestState.predicted.health_index < 48
              ? 'critical'
              : 'warning'
          }
          icon={<Cpu size={18} />}
        />

        <KpiTile
          label="Independent Anomaly Detector"
          value={isAnomaly ? 'ANOMALY ACTIVE' : 'NOMINAL'}
          subtext={`Score: ${latestState.predicted.anomaly_score.toFixed(3)} (Thr: ${latestState.predicted.anomaly_threshold.toFixed(3)})`}
          status={isAnomaly ? 'caution' : 'nominal'}
          icon={<Activity size={18} />}
        />

        <KpiTile
          label="Sensor vs Engine Fault Isolation"
          value={sDiag.diagnosis_status}
          subtext={`Suspected: ${
            sDiag.suspected_channels.length > 0
              ? sDiag.suspected_channels.join(', ')
              : 'None'
          } · Mode: ${sDiag.fault_submode || 'N/A'}`}
          status={
            sDiag.is_sensor_fault_detected
              ? 'caution'
              : sDiag.is_ambiguous
              ? 'warning'
              : 'nominal'
          }
          icon={<ShieldCheck size={18} />}
        />

        <KpiTile
          label="Affected Propulsion Subsystem"
          value={affectedSubsystem.split('·')[0].trim()}
          subtext="Inferred from lumped telemetry - not sensor-localized"
          status="info"
          icon={<Layers size={18} />}
        />
      </div>

      {/* ROW 2: 9-CLASS PROBABILITY DISTRIBUTION & SENSOR ISOLATOR */}
      <div className="faults-main-grid">
        {/* PANEL A: 9-CLASS RANKED POSTERIOR DISTRIBUTION */}
        <GlassPanel className="faults-panel">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <BarChart2 size={14} /> 9-Class Fault Classifier Posterior Probabilities
            </div>
            <StatusChip
              status={activeFault === 'Normal' ? 'nominal' : 'caution'}
              label={`TOP: ${activeFault}`}
            />
          </div>

          <div className="faults-prob-list">
            {rankedProbabilities.map((item, idx) => {
              const isTop = item.fault_class === activeFault;
              return (
                <div
                  key={item.fault_class}
                  className={`faults-prob-item ${isTop ? 'active-rank' : ''}`}
                >
                  <div className="faults-prob-row-header">
                    <div className="faults-prob-label-group">
                      <span className="faults-rank-badge mono">#{idx + 1}</span>
                      <span className="faults-class-name">{item.fault_class}</span>
                      {isTop && (
                        <span className="badge badge-info" style={{ fontSize: 9.5 }}>
                          PREDICTED
                        </span>
                      )}
                    </div>
                    <span className="mono faults-prob-num">
                      {item.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="faults-prob-track">
                    <div
                      className={`faults-prob-fill ${
                        item.fault_class === 'Normal'
                          ? 'fill-normal'
                          : isTop
                          ? 'fill-top'
                          : 'fill-other'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="faults-panel-footer mono">
            Certainty: {latestState.predicted.diagnosis_certainty_status} · Multi-class posterior sum:{' '}
            {rankedProbabilities.reduce((acc, c) => acc + c.probability, 0).toFixed(2)}
          </div>
        </GlassPanel>

        {/* PANEL B: SENSOR-FAULT ISOLATOR & RESIDUAL DEVIATIONS */}
        <GlassPanel className="faults-panel">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <ShieldAlert size={14} /> Sensor-Fault Isolator & Cross-Channel Evidence
            </div>
            <span className="badge badge-info">{sDiag.isolator_version}</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="kpi-label" style={{ marginBottom: 6 }}>
              Cross-Channel Isolation Findings
            </div>
            {sDiag.evidence.length === 0 ? (
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                No cross-channel discrepancies detected. Instrumentation within consistency bounds.
              </div>
            ) : (
              <div className="faults-evidence-list">
                {sDiag.evidence.map((ev, i) => (
                  <div key={i} className="faults-evidence-item mono">
                    <span className="evidence-bullet">•</span>
                    <span>{ev}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="kpi-label" style={{ marginBottom: 6 }}>
            Instantaneous Physics Residuals (Actual − Expected)
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
              (UI display bands [indicative])
            </span>
          </div>
          <table className="eng-table mono" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Actual</th>
                <th>Physics Ref</th>
                <th>Residual Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CHT (°C)</td>
                <td>{latestState.actual.cht_c.toFixed(1)}</td>
                <td>{latestState.expected.cht_c.toFixed(1)}</td>
                <td
                  style={{
                    color:
                      Math.abs(latestState.calculated.cht_residual_c) >= 10
                        ? 'var(--color-caution)'
                        : 'var(--text-primary)',
                  }}
                >
                  {latestState.calculated.cht_residual_c >= 0 ? '+' : ''}
                  {latestState.calculated.cht_residual_c.toFixed(1)} °C
                </td>
              </tr>
              <tr>
                <td>EGT (°C)</td>
                <td>{latestState.actual.egt_c.toFixed(0)}</td>
                <td>{latestState.expected.egt_c.toFixed(0)}</td>
                <td
                  style={{
                    color:
                      Math.abs(latestState.calculated.egt_residual_c) >= 25
                        ? 'var(--color-caution)'
                        : 'var(--text-primary)',
                  }}
                >
                  {latestState.calculated.egt_residual_c >= 0 ? '+' : ''}
                  {latestState.calculated.egt_residual_c.toFixed(0)} °C
                </td>
              </tr>
              <tr>
                <td>Oil P (bar)</td>
                <td>{latestState.actual.oil_pressure_bar.toFixed(2)}</td>
                <td>{latestState.expected.oil_pressure_bar.toFixed(2)}</td>
                <td
                  style={{
                    color:
                      latestState.calculated.oil_pressure_residual_bar < -0.35
                        ? 'var(--color-critical)'
                        : 'var(--text-primary)',
                  }}
                >
                  {latestState.calculated.oil_pressure_residual_bar >= 0 ? '+' : ''}
                  {latestState.calculated.oil_pressure_residual_bar.toFixed(3)} bar
                </td>
              </tr>
              <tr>
                <td>Oil T (°C)</td>
                <td>{latestState.actual.oil_temp_c.toFixed(1)}</td>
                <td>{latestState.expected.oil_temp_c.toFixed(1)}</td>
                <td
                  style={{
                    color:
                      Math.abs(latestState.calculated.oil_temp_residual_c) >= 8
                        ? 'var(--color-caution)'
                        : 'var(--text-primary)',
                  }}
                >
                  {latestState.calculated.oil_temp_residual_c >= 0 ? '+' : ''}
                  {latestState.calculated.oil_temp_residual_c.toFixed(1)} °C
                </td>
              </tr>
              <tr>
                <td>Vibration (mm/s)</td>
                <td>{latestState.actual.vibration_rms_mms.toFixed(2)}</td>
                <td>{latestState.expected.vibration_rms_mms.toFixed(2)}</td>
                <td
                  style={{
                    color:
                      latestState.calculated.vibration_residual_mms >= 0.70
                        ? 'var(--color-caution)'
                        : 'var(--text-primary)',
                  }}
                >
                  {latestState.calculated.vibration_residual_mms >= 0 ? '+' : ''}
                  {latestState.calculated.vibration_residual_mms.toFixed(3)} mm/s
                </td>
              </tr>
              <tr>
                <td>Fuel Flow (L/h)</td>
                <td>{latestState.actual.fuel_flow_lph.toFixed(1)}</td>
                <td>{latestState.expected.fuel_flow_lph.toFixed(1)}</td>
                <td
                  style={{
                    color:
                      Math.abs(latestState.calculated.fuel_flow_residual_lph) >= 1.8
                        ? 'var(--color-caution)'
                        : 'var(--text-primary)',
                  }}
                >
                  {latestState.calculated.fuel_flow_residual_lph >= 0 ? '+' : ''}
                  {latestState.calculated.fuel_flow_residual_lph.toFixed(2)} L/h
                </td>
              </tr>
            </tbody>
          </table>

          <div className="faults-panel-footer mono">
            Confidence: {(sDiag.confidence * 100).toFixed(1)}% · Mode: {sDiag.fault_submode || 'NONE'}
          </div>
        </GlassPanel>
      </div>

      {/* ROW 3: GLOBAL FEATURE IMPORTANCES (FROM /api/model-status, NO SHAP) */}
      <GlassPanel className="faults-panel" style={{ marginTop: 14 }}>
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Info size={14} /> Global Model Feature Importances (Random Forest Ensemble)
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--cyan)' }}>
              Macro F1: {modelStatus?.evaluation_report?.classifier_held_out_macro_f1 != null ? (modelStatus.evaluation_report.classifier_held_out_macro_f1 * 100).toFixed(1) + '%' : 'N/A'}
            </span>
            <span className="badge badge-info">
              {modelStatus?.evaluation_report?.model_version || 'DRISHTI-ML-v1.0'}
            </span>
          </div>
        </div>

        {modelLoading ? (
          <Skeleton variant="rect" height={120} count={1} />
        ) : rankedFeatureImportances.length === 0 ? (
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>
            Feature importances unavailable from /api/model-status.
          </div>
        ) : (
          <div className="faults-features-grid">
            {rankedFeatureImportances.map((item, idx) => (
              <div key={item.feature} className="faults-feature-card">
                <div className="faults-feature-header mono">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    #{idx + 1} {item.feature}
                  </span>
                  <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>
                    {item.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="faults-prob-track">
                  <div
                    className="faults-prob-fill fill-top"
                    style={{ width: `${Math.min(100, Math.max(0, item.pct * 2.5))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="faults-panel-footer mono">
          EXPLAINABILITY NOTE: Global Random Forest Gini impurity feature importances from /api/model-status. Evaluated across all 12 input signals. TreeSHAP is intentionally excluded.
        </div>
      </GlassPanel>

      {/* ROW 4: EXPLAINABLE ALERT LOG & MAINTENANCE RECOMMENDATIONS */}
      <GlassPanel className="faults-panel" style={{ marginTop: 14 }}>
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Wrench size={14} /> Explainable Alert Feed & Maintenance Actions ({alerts.length})
          </div>
          {Boolean(catalog?.sih26054_eight_fault_categories) && (
            <button
              className="btn btn-sm"
              onClick={() => setShowCatalogMatrix((v) => !v)}
            >
              {showCatalogMatrix ? (
                <>
                  <ChevronUp size={12} /> Hide SIH26054 Catalog Matrix
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> Inspect SIH26054 8-Category Reference Matrix
                </>
              )}
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="mono" style={{ color: 'var(--text-muted)', padding: '14px 0', fontSize: 11.5 }}>
            No explainable alerts active for engine {engineId}. Telemetry residuals are within nominal physics boundaries.
          </div>
        ) : (
          <div className="faults-alerts-container">
            {alerts.slice(0, 10).map((alt) => {
              const isAcking = ackLoadingId === alt.alert_id;
              const sevClass = getSeverityClass(alt.severity);
              return (
                <div
                  key={alt.alert_id}
                  className={`fault-alert-card ${sevClass} ${
                    alt.acknowledged ? 'is-acknowledged' : ''
                  }`}
                >
                  <div className="fault-alert-header">
                    <div className="fault-alert-meta">
                      <SeverityBadge
                        severity={
                          alt.severity.toLowerCase() === 'critical'
                            ? 'critical'
                            : alt.severity.toLowerCase() === 'warning'
                            ? 'warning'
                            : alt.severity.toLowerCase() === 'caution'
                            ? 'caution'
                            : 'nominal'
                        }
                      />
                      <span className="mono fault-alert-id">{alt.alert_id}</span>
                      <strong className="fault-alert-class">{alt.fault_class}</strong>
                      <span className="badge badge-info">{alt.anomaly_type}</span>
                      {alt.acknowledged && (
                        <span className="badge badge-nominal">ACKNOWLEDGED</span>
                      )}
                    </div>
                    <div className="fault-alert-actions">
                      <span className="mono fault-alert-time">
                        {alt.timestamp} · Seq #{alt.sequence_number}
                      </span>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleAcknowledgeAlert(alt.alert_id, alt.acknowledged)}
                        disabled={isAcking}
                      >
                        <CheckCircle2 size={11} />
                        <span>
                          {isAcking
                            ? 'Updating…'
                            : alt.acknowledged
                            ? 'Unacknowledge'
                            : 'Acknowledge'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="fault-alert-body">
                    <div className="mono fault-alert-score-line">
                      <strong>Score & Models:</strong> {alt.score_label} | {alt.model_version} / {alt.rule_version}
                    </div>

                    <div className="fault-alert-evidence">
                      {alt.supporting_evidence.map((ev, idx) => (
                        <div key={idx} className="evidence-bullet-line">
                          • {ev}
                        </div>
                      ))}
                    </div>

                    {alt.actual_vs_expected_deviations && Object.keys(alt.actual_vs_expected_deviations).length > 0 && (
                      <div className="fault-alert-deviations mono">
                        <strong>Residual Deviations: </strong>
                        {Object.entries(alt.actual_vs_expected_deviations).map(([k, v]) => (
                          <span key={k} className="dev-tag">
                            {k}: {v >= 0 ? '+' : ''}{v.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="fault-alert-action-box">
                      <strong>Recommended Investigation Action:</strong> {alt.recommended_action}
                    </div>

                    <div className="mono fault-alert-footer-note">
                      {alt.evidence_source_statement} · Limitations: {alt.data_quality_limitations.join('; ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {/* OPTIONAL EXPANDABLE: SIH26054 8-CATEGORY REFERENCE MATRIX */}
      {Boolean(showCatalogMatrix && catalog?.sih26054_eight_fault_categories) && (
        <GlassPanel className="faults-panel" style={{ marginTop: 14 }}>
          <div className="panel-card-header">
            <div className="panel-card-title">
              <HelpCircle size={14} /> SIH26054 Official 8-Fault-Category Reference Matrix
            </div>
            <span className="badge badge-info">OFFICIAL PROBLEM STATEMENT SPECIFICATION</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="eng-table mono" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Category ID</th>
                  <th>Fault Mode</th>
                  <th>Diagnostic Signals</th>
                  <th>Expected Physics Behavior</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(
                  (catalog?.sih26054_eight_fault_categories || {}) as Record<string, Record<string, string>>
                ).map(([catKey, catData]) => (
                  <tr key={catKey}>
                    <td style={{ color: 'var(--cyan)' }}>{catKey}</td>
                    <td><strong>{catData.name || catKey}</strong></td>
                    <td>{catData.primary_signals || 'Telemetry residuals'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {catData.description || catData.symptom || 'Nominal behavior'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      )}
    </div>
  );
};
