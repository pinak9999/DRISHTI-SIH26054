import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, AlertOctagon } from 'lucide-react';

export type SeverityLevel =
  | 'NOMINAL'
  | 'CAUTION'
  | 'WARNING'
  | 'CRITICAL'
  | 'nominal'
  | 'caution'
  | 'warning'
  | 'critical';

export interface SeverityBadgeProps {
  severity: SeverityLevel | string;
  customLabel?: string;
  className?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  customLabel,
  className = '',
}) => {
  const norm = severity.toLowerCase();

  let IconComp = CheckCircle2;
  let variant = 'nominal';
  let defaultLabel = 'NOMINAL';

  if (norm.includes('crit')) {
    IconComp = AlertOctagon;
    variant = 'critical';
    defaultLabel = 'CRITICAL';
  } else if (norm.includes('warn')) {
    IconComp = AlertCircle;
    variant = 'warning';
    defaultLabel = 'WARNING';
  } else if (norm.includes('caut')) {
    IconComp = AlertTriangle;
    variant = 'caution';
    defaultLabel = 'CAUTION';
  }

  const label = customLabel || defaultLabel;

  return (
    <span
      className={`ui-severity-badge ${variant} ${className}`}
      role="status"
      aria-label={`Severity: ${label}`}
    >
      <span className="ui-severity-icon" aria-hidden="true">
        <IconComp size={12} />
      </span>
      <span className="ui-severity-label">{label}</span>
    </span>
  );
};
