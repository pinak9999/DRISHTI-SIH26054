import React from 'react';
import { motion } from 'framer-motion';

export interface RingGaugeProps {
  value: number;
  min?: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  status?: 'nominal' | 'caution' | 'warning' | 'critical' | 'info';
  label?: string;
  unit?: string;
  showValue?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  nominal: 'var(--color-nominal)',
  caution: 'var(--color-caution)',
  warning: 'var(--color-warning)',
  critical: 'var(--color-critical)',
  info: 'var(--cyan)',
};

export const RingGauge: React.FC<RingGaugeProps> = ({
  value,
  min = 0,
  max = 100,
  size = 80,
  strokeWidth = 7,
  status = 'nominal',
  label,
  unit = '%',
  showValue = true,
  className = '',
}) => {
  const clamped = Math.min(max, Math.max(min, value));
  const pct = (clamped - min) / (max - min);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  const strokeColor = STATUS_COLORS[status] || STATUS_COLORS.nominal;

  return (
    <div
      className={`ui-ring-gauge ${className}`}
      style={{ width: size, height: size }}
      role="meter"
      aria-label={label ? `${label} gauge` : 'Status gauge'}
      aria-valuenow={clamped}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${clamped.toFixed(1)}${unit}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          className="ui-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        {/* Animated fill */}
        <motion.circle
          className="ui-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      {showValue && (
        <div className="ui-ring-center">
          <span className="ui-ring-val">
            {clamped.toFixed(0)}
            <small style={{ fontSize: '0.6em', opacity: 0.8 }}>{unit}</small>
          </span>
          {label && <span className="ui-ring-label">{label}</span>}
        </div>
      )}
    </div>
  );
};
