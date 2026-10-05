import React from 'react';

export interface StatusChipProps {
  status?: 'nominal' | 'caution' | 'critical' | 'info';
  label: string;
  pulse?: boolean;
  icon?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status = 'nominal',
  label,
  pulse = false,
  icon,
  className = '',
  onClick,
}) => {
  return (
    <span
      className={`ui-status-chip ${status} ${className}`}
      role="status"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {icon ? (
        <span aria-hidden="true">{icon}</span>
      ) : (
        <span
          className={`ui-status-dot ${pulse ? 'pulse' : ''}`}
          aria-hidden="true"
        />
      )}
      <span className="ui-status-label">{label}</span>
    </span>
  );
};
