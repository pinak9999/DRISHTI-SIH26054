import React from 'react';

export interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle';
  width?: string | number;
  height?: string | number;
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
  style,
}) => {
  const items = Array.from({ length: count });

  const getVariantClass = () => {
    switch (variant) {
      case 'rect':
        return 'ui-skeleton-rect';
      case 'circle':
        return 'ui-skeleton-circle';
      default:
        return 'ui-skeleton-text';
    }
  };

  return (
    <>
      {items.map((_, i) => (
        <div
          key={i}
          className={`ui-skeleton ${getVariantClass()} ${className}`}
          style={{
            width,
            height,
            ...style,
          }}
          aria-busy="true"
          aria-label="Loading content…"
          role="status"
        />
      ))}
    </>
  );
};
