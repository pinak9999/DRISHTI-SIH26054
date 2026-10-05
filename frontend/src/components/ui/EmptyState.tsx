import React from 'react';
import { Database } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Database size={32} />,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`ui-empty-state ${className}`} role="status">
      <div className="ui-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="ui-empty-title">{title}</div>
      {description && <div className="ui-empty-desc">{description}</div>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
};
