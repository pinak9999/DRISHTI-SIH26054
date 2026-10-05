import React, { useEffect, useRef, useState } from 'react';
import { motion, animate } from 'framer-motion';

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
  const [renderedStr, setRenderedStr] = useState<string>(() =>
    isNumber ? Number(value).toFixed(precision) : String(value)
  );
  const prevValRef = useRef<number>(isNumber ? Number(value) : 0);

  useEffect(() => {
    if (!isNumber) {
      setRenderedStr(String(value));
      return;
    }

    const numVal = Number(value);
    const startVal = prevValRef.current;
    prevValRef.current = numVal;

    if (Math.abs(numVal - startVal) < 0.0001) {
      setRenderedStr(numVal.toFixed(precision));
      return;
    }

    const controls = animate(startVal, numVal, {
      duration: 0.3,
      ease: 'easeOut',
      onUpdate: (latest) => {
        setRenderedStr(latest.toFixed(precision));
      },
    });

    return () => controls.stop();
  }, [value, isNumber, precision]);

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
