import React from 'react';
import { motion } from 'framer-motion';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel = 'Segment options',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`ui-segmented-control ${className}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`ui-segmented-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
            <span>{opt.label}</span>
            {isActive && (
              <motion.div
                layoutId="segmented-indicator"
                className="ui-segmented-indicator"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
