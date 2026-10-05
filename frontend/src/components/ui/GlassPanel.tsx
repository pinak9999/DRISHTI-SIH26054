import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

export interface GlassPanelProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  variant?: 'default' | 'tinted';
  glow?: 'none' | 'cyan' | 'nominal' | 'caution' | 'critical';
  hoverable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  variant = 'default',
  glow = 'none',
  hoverable = false,
  className = '',
  style,
  ...rest
}) => {
  const classes = [
    'glass-panel',
    variant === 'tinted' ? 'glass-panel--tinted' : '',
    glow !== 'none' ? `glass-panel--glow-${glow}` : '',
    hoverable ? 'glass-panel--hoverable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={classes}
      style={style}
      {...rest}
    >
      {children}
    </motion.div>
  );
};
