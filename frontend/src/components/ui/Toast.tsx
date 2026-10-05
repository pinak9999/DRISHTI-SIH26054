import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  status?: 'nominal' | 'caution' | 'critical' | 'info';
  duration?: number;
}

export interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration || 4500);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  const getIcon = () => {
    switch (toast.status) {
      case 'critical':
        return <AlertOctagon size={16} className="text-critical" />;
      case 'caution':
        return <AlertTriangle size={16} className="text-caution" />;
      case 'nominal':
        return <CheckCircle2 size={16} className="text-nominal" />;
      default:
        return <Info size={16} className="text-cyan" />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      className={`ui-toast ${toast.status || 'info'}`}
      role="alert"
    >
      <div className="ui-toast-icon" aria-hidden="true">
        {getIcon()}
      </div>
      <div className="ui-toast-content">
        <div className="ui-toast-title">{toast.title}</div>
        {toast.message && <div className="ui-toast-msg">{toast.message}</div>}
      </div>
      <button
        type="button"
        className="ui-toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
};

export interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="ui-toast-container" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
