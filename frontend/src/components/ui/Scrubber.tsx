import React, { useRef } from 'react';

export interface ScrubberMarker {
  position: number;
  severity: 'nominal' | 'caution' | 'warning' | 'critical';
  label?: string;
}

export interface ScrubberProps {
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  markers?: ScrubberMarker[];
  formatValue?: (val: number) => string;
  ariaLabel?: string;
  className?: string;
}

export const Scrubber: React.FC<ScrubberProps> = ({
  value,
  min = 0,
  max,
  step = 1,
  onChange,
  markers = [],
  formatValue = (v) => `${v.toFixed(0)}s`,
  ariaLabel = 'Mission replay timeline scrubber',
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const clamped = Math.min(max, Math.max(min, value));
  const range = max - min || 1;
  const pct = ((clamped - min) / range) * 100;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const update = (clientX: number) => {
      const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = clickX / rect.width;
      const rawVal = min + ratio * range;
      const stepped = Math.round(rawVal / step) * step;
      onChange(Math.min(max, Math.max(min, stepped)));
    };

    update(e.clientX);

    const onPointerMove = (ev: PointerEvent) => update(ev.clientX);
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(max, clamped + step));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(min, clamped - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  return (
    <div className={`ui-scrubber ${className}`}>
      <div
        ref={trackRef}
        className="ui-scrubber-track"
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={formatValue(clamped)}
      >
        <div className="ui-scrubber-fill" style={{ width: `${pct}%` }} />
        <div className="ui-scrubber-thumb" style={{ left: `${pct}%` }} />

        {/* Alert event markers */}
        {markers.map((m, idx) => {
          const markerPct = ((Math.min(max, Math.max(min, m.position)) - min) / range) * 100;
          const markerColor =
            m.severity === 'critical'
              ? 'var(--color-critical)'
              : m.severity === 'warning'
              ? 'var(--color-warning)'
              : m.severity === 'caution'
              ? 'var(--color-caution)'
              : 'var(--color-nominal)';
          return (
            <div
              key={idx}
              title={m.label || `Event at ${formatValue(m.position)}`}
              style={{
                position: 'absolute',
                left: `${markerPct}%`,
                top: '-2px',
                width: '4px',
                height: '10px',
                borderRadius: '1px',
                background: markerColor,
                zIndex: 3,
                pointerEvents: 'none',
              }}
            />
          );
        })}
      </div>

      <div className="ui-scrubber-labels">
        <span>{formatValue(min)}</span>
        <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{formatValue(clamped)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
};
