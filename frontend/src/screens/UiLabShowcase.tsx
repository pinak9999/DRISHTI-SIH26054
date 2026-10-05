import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  Flame,
  Gauge,
  Layers,
  Radio,
  RefreshCw,
} from 'lucide-react';
import {
  GlassPanel,
  KpiTile,
  RingGauge,
  Sparkline,
  StatusChip,
  SeverityBadge,
  SyntheticBadge,
  DataTable,
  SegmentedControl,
  Scrubber,
  Skeleton,
  EmptyState,
  Drawer,
  ToastContainer,
  ToastMessage,
} from '../components/ui';

interface SampleRow {
  channel: string;
  actual: string;
  expected: string;
  delta: string;
  status: 'NOMINAL' | 'CAUTION' | 'CRITICAL';
}

export const UiLabShowcase: React.FC<{
  currentTheme: 'dark' | 'light';
  onToggleTheme: () => void;
}> = ({ currentTheme, onToggleTheme }) => {
  const [activeSegment, setActiveSegment] = useState<'1m' | '5m' | '15m' | '1h'>('5m');
  const [scrubberVal, setScrubberVal] = useState<number>(42);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (status: 'nominal' | 'caution' | 'critical' | 'info') => {
    const id = `toast-${Date.now()}`;
    const titles = {
      nominal: 'Telemetric Sync Nominal',
      caution: 'Thermal Drift Detected',
      critical: 'Critical CHT Excursion',
      info: 'FADEC Calibration Ready',
    };
    setToasts((prev) => [
      ...prev,
      {
        id,
        title: titles[status],
        message: `Placeholders for testing notification delivery in ${currentTheme} theme.`,
        status,
        duration: 4000,
      },
    ]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const sampleRows: SampleRow[] = [
    { channel: 'CHT Cyl 1-4 Avg', actual: '231.9 °C', expected: '177.4 °C', delta: '+54.5 °C', status: 'CRITICAL' },
    { channel: 'Exhaust Gas Temp', actual: '842.2 °C', expected: '810.6 °C', delta: '+31.6 °C', status: 'CAUTION' },
    { channel: 'Oil Pressure', actual: '4.46 bar', expected: '4.42 bar', delta: '+0.04 bar', status: 'NOMINAL' },
    { channel: 'Vibration RMS', actual: '2.43 mm/s', expected: '2.47 mm/s', delta: '-0.04 mm/s', status: 'NOMINAL' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Toast Host */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* HEADER BANNER */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={20} className="text-cyan" />
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              DRISHTI Aerospace Design System — UI Lab Showcase
            </h1>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 4,
                padding: '2px 8px',
              }}
            >
              DEV-ONLY ROUTE
            </span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
            Visual test-bed for mission-critical Ground Control Station UI primitives in dark & light themes.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm" onClick={onToggleTheme}>
            Toggle Theme (Current: {currentTheme.toUpperCase()})
          </button>
        </div>
      </div>

      {/* SECTION 1: BADGES, STATUS CHIPS & SYNTHETIC DISCLAIMER */}
      <div className="glass-panel" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 14 }}>
          1. SeverityBadges, StatusChips & Synthetic Disclaimer
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <SeverityBadge severity="NOMINAL" />
          <SeverityBadge severity="CAUTION" />
          <SeverityBadge severity="WARNING" />
          <SeverityBadge severity="CRITICAL" />

          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)' }} />

          <StatusChip status="nominal" label="FADEC LINK ACTIVE" pulse />
          <StatusChip status="caution" label="COOLING RESTRICTION" />
          <StatusChip status="critical" label="CRITICAL ALARM" pulse />
          <StatusChip status="info" label="SYNCHRONIZED WS" />

          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)' }} />

          <SyntheticBadge isSynthetic={true} label="SIMULATED" />
          <SyntheticBadge isSynthetic={true} label="SYNTHETIC HELD-OUT" />
        </div>
      </div>

      {/* SECTION 2: KPI TILES & COUNT-UP SPRINGS */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>
          2. KpiTile (Animated Count-Up & Glow States)
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <KpiTile
            label="Monitored Fleet Health"
            value={94.5}
            unit="HI"
            subtext="+1.8% vs nominal cruise baseline"
            status="nominal"
            icon={<Activity size={16} />}
          />
          <KpiTile
            label="Exhaust Gas Temperature"
            value={842}
            unit="°C"
            subtext="+31.6 °C thermal deviation"
            status="caution"
            icon={<Flame size={16} />}
          />
          <KpiTile
            label="Remaining Useful Life"
            value={16.5}
            unit="hrs"
            subtext="NO-GO threshold triggered"
            status="critical"
            icon={<AlertTriangle size={16} />}
          />
          <KpiTile
            label="Rotational Engine RPM"
            value={4945}
            unit="RPM"
            subtext="Within MALE UAV operational envelope"
            status="info"
            icon={<Gauge size={16} />}
          />
        </div>
      </div>

      {/* SECTION 3: RING GAUGES & SPARKLINE TRENDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div className="glass-panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 14 }}>
            3. RingGauge (Circular SVG Meter)
          </h2>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <RingGauge value={88} status="nominal" label="HEALTH" size={88} />
            <RingGauge value={62} status="caution" label="PRESSURE" size={88} />
            <RingGauge value={24} status="critical" label="RUL" size={88} />
            <RingGauge value={99.4} status="info" label="QUALITY" size={88} />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 14 }}>
            4. Sparkline (Micro Trend Visualizer)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Nominal RPM Progression</span>
              <Sparkline data={[4800, 4820, 4850, 4900, 4920, 4940, 4945]} color="var(--color-nominal)" width={120} height={26} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>CHT Thermal Runaway</span>
              <Sparkline data={[175, 178, 185, 202, 218, 226, 232]} color="var(--color-critical)" width={120} height={26} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Oil Pressure Wave</span>
              <Sparkline data={[4.4, 4.42, 4.41, 4.45, 4.43, 4.46]} color="var(--cyan)" width={120} height={26} />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: DATA TABLE (STICKY HEADER + MONO NUMERALS) */}
      <div className="glass-panel" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>
            5. DataTable (Sticky Header & Tabular Mono Numerals)
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing 4 telemetry verification rows</span>
        </div>
        <DataTable<SampleRow>
          columns={[
            { key: 'channel', header: 'Parameter Channel', width: '30%' },
            { key: 'actual', header: 'Actual (Telem)', mono: true, width: '20%' },
            { key: 'expected', header: 'Physics Ref', mono: true, width: '20%' },
            { key: 'delta', header: 'Residual (Δ)', mono: true, width: '15%' },
            {
              key: 'status',
              header: 'Verdict',
              width: '15%',
              render: (row) => <SeverityBadge severity={row.status} />,
            },
          ]}
          data={sampleRows}
          keyExtractor={(row) => row.channel}
        />
      </div>

      {/* SECTION 5: INTERACTIVE CONTROLS (SEGMENTED CONTROL & SCRUBBER) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div className="glass-panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>
            6. SegmentedControl (Accessible Radiogroup)
          </h2>
          <SegmentedControl<'1m' | '5m' | '15m' | '1h'>
            options={[
              { value: '1m', label: '1 Minute' },
              { value: '5m', label: '5 Minutes' },
              { value: '15m', label: '15 Minutes' },
              { value: '1h', label: '1 Hour' },
            ]}
            value={activeSegment}
            onChange={setActiveSegment}
            ariaLabel="Time range selection"
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Selected range: <strong style={{ color: 'var(--cyan)' }}>{activeSegment}</strong>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>
            7. Scrubber (Interactive Mission Timeline)
          </h2>
          <Scrubber
            min={0}
            max={120}
            value={scrubberVal}
            onChange={setScrubberVal}
            markers={[
              { position: 20, severity: 'caution', label: 'Caution onset' },
              { position: 65, severity: 'critical', label: 'Overheating threshold exceeded' },
            ]}
          />
        </div>
      </div>

      {/* SECTION 6: SKELETON LOADERS & EMPTY STATES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div className="glass-panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>
            8. Skeleton Placeholders (Loading States)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton variant="text" width="60%" height={16} />
            <Skeleton variant="text" width="90%" height={12} />
            <Skeleton variant="rect" width="100%" height={48} />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>
            9. EmptyState Placeholder
          </h2>
          <EmptyState
            icon={<Database size={30} />}
            title="No Ingested CSV Telemetry"
            description="Drag and drop FADEC flight logs or run the scenario fault injector to populate time-series records."
            action={
              <button className="btn btn-sm" onClick={() => addToast('info')}>
                Simulate Ingestion
              </button>
            }
          />
        </div>
      </div>

      {/* SECTION 7: DRAWER & TOAST CONTROLS */}
      <div className="glass-panel" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>
          10. Drawer & Toast Notification System
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button className="btn btn-sm" onClick={() => setIsDrawerOpen(true)}>
            Open Test Drawer
          </button>
          <button className="btn btn-sm" onClick={() => addToast('nominal')}>
            Trigger Nominal Toast
          </button>
          <button className="btn btn-sm" onClick={() => addToast('caution')}>
            Trigger Caution Toast
          </button>
          <button className="btn btn-sm" onClick={() => addToast('critical')}>
            Trigger Critical Toast
          </button>
        </div>
      </div>

      {/* SLIDE-OVER DRAWER */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Engine Subsystem Telemetric Inspection"
        footer={
          <button className="btn btn-sm" onClick={() => setIsDrawerOpen(false)}>
            Close Drawer
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            This drawer tests the slide-over overlay, backdrop blur, escape key dismissal, and accessibility focus management.
          </p>
          <div className="glass-panel" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>DIAGNOSTIC TEST RECORD</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
              SUB-05 · Cylinder Head & Valvetrain
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
};
