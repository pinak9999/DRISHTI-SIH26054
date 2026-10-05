import React from 'react';

export interface SyntheticBadgeProps {
  isSynthetic?: boolean;
  label?: 'SIMULATED' | 'SYNTHETIC' | string;
  className?: string;
  showPulse?: boolean;
}

export const SyntheticBadge: React.FC<SyntheticBadgeProps> = ({
  isSynthetic = true,
  label = 'SIMULATED',
  className = '',
  showPulse = true,
}) => {
  if (!isSynthetic) return null;

  return (
    <span
      className={`ui-synthetic-badge ${className}`}
      title="Aerospace Digital Twin: Simulation model telemetry. Not certified flight data."
      role="note"
      aria-label={`Data source disclaimer: ${label}`}
    >
      {showPulse && <span className="ui-synthetic-pulse" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
};
