import React from 'react';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  fill?: boolean;
  ariaLabel?: string;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 80,
  height = 24,
  color = 'var(--cyan)',
  strokeWidth = 1.5,
  fill = true,
  ariaLabel = 'Telemetry trend sparkline',
  className = '',
}) => {
  if (!data || data.length < 2) {
    return (
      <div
        className={`ui-sparkline ${className}`}
        style={{ width, height }}
        role="img"
        aria-label="No trend data"
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  const effW = width - padding * 2;
  const effH = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * effW;
    const y = padding + effH - ((d - min) / range) * effH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const fillD = `${pathD} L ${width - padding},${height} L ${padding},${height} Z`;

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`;
  const lastX = padding + effW;
  const lastY = padding + effH - ((data[data.length - 1] - min) / range) * effH;

  return (
    <div
      className={`ui-sparkline ${className}`}
      style={{ width, height }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={width} height={height} className="ui-sparkline-svg">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {fill && <path d={fillD} fill={`url(#${gradientId})`} />}
        <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r={2} fill={color} />
      </svg>
    </div>
  );
};
