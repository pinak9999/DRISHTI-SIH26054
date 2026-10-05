import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export interface KpiTileProps {
  label: string;
  value: number | string;
  unit?: string;
  subtext?: string;
  status?: 'nominal' | 'caution' | 'warning' | 'critical' | 'info';
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  precision?: number;
  className?: string;
  onClick?: () => void;
}

export const KpiTile: React.FC<KpiTileProps> = ({
  label,
  value,
  unit,
  subtext,
  status,
  icon,
  badge,
  precision = 1,
  className = '',
  onClick,
}) => {
  const isNumber = typeof value === 'number';
  const spring = useSpring(0, { mass: 0.8, stiffness: 75, damping: 15 });
  const displayVal = useTransform(spring, (current) => current.toFixed(precision));
  const [renderedStr, setRenderedStr] = useState<string>(
    isNumber ? (0).toFixed(precision) : String(value)
  );

  useEffect(() => {
    if (isNumber) {
      spring.set(value);
      const unsubscribe = displayVal.on('change', (v) => setRenderedStr(v));
      return () => unsubscribe();
    } else {
      setRenderedStr(String(value));
    }
  }, [value, isNumber, spring, displayVal]);

  const tileClasses = [
    'glass-panel',
    'ui-kpi-tile',
    status ? `glass-panel--glow-${status === 'warning' ? 'caution' : status}` : '',
    onClick ? 'glass-panel--hoverable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={tileClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
    >
      <div className="ui-kpi-header">
        <span className="ui-kpi-label">{label}</span>
        {badge || (icon && <span className="ui-kpi-icon" aria-hidden="true">{icon}</span>)}
      </div>

      <div className="ui-kpi-value-row">
        <motion.span
          className="ui-kpi-value"
          aria-label={`${label}: ${renderedStr} ${unit || ''}`}
        >
          {renderedStr}
        </motion.span>
        {unit && <span className="ui-kpi-unit">{unit}</span>}
      </div>

      {subtext && (
        <div className={`ui-kpi-subtext ${status || ''}`}>
          {subtext}
        </div>
      )}
    </div>
  );
};
