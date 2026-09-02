import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (title: string, options?: { type?: ToastType; message?: string; duration?: number }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, options?: { type?: ToastType; message?: string; duration?: number }) => {
      const id = Math.random().toString(36).substring(2, 9);
      const type = options?.type ?? 'info';
      const duration = options?.duration ?? 3500;

      const newToast: ToastItem = {
        id,
        type,
        title,
        message: options?.message,
        duration,
      };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  const success = useCallback((title: string, message?: string) => showToast(title, { type: 'success', message }), [showToast]);
  const error = useCallback((title: string, message?: string) => showToast(title, { type: 'error', message }), [showToast]);
  const info = useCallback((title: string, message?: string) => showToast(title, { type: 'info', message }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      {/* Toast viewport */}
      <div className="fixed bottom-9 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${
              toast.type === 'success'
                ? 'bg-surface-raised/95 border-success/40 text-foreground'
                : toast.type === 'error'
                ? 'bg-surface-raised/95 border-danger/40 text-foreground'
                : 'bg-surface-raised/95 border-accent/40 text-foreground'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 size="1.1rem" className="text-success" />}
              {toast.type === 'error' && <AlertCircle size="1.1rem" className="text-danger" />}
              {toast.type === 'info' && <Info size="1.1rem" className="text-accent" />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium tracking-tight text-foreground">{toast.title}</p>
              {toast.message && (
                <p className="text-2xs text-muted-foreground mt-0.5 leading-relaxed break-words">{toast.message}</p>
              )}
            </div>

            <button
              onClick={() => dismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded transition-colors"
            >
              <X size="0.85rem" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
