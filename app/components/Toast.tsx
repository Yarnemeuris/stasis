'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'success' | 'info' | 'warn' | 'error';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;
}

interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3000;
const LEAVE_DURATION = 200;

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextIdRef = useRef(1);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, LEAVE_DURATION);
  }, []);

  const showToast = useCallback<ToastContextValue['showToast']>((message, options) => {
    const id = nextIdRef.current++;
    const variant = options?.variant ?? 'success';
    const duration = options?.durationMs ?? DEFAULT_DURATION;
    setToasts((prev) => [...prev, { id, message, variant, leaving: false }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  const portal = mounted
    ? createPortal(
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
          aria-live="polite"
          aria-atomic="true"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`pointer-events-auto flex items-center gap-2 px-4 py-2 border-2 shadow-lg cursor-pointer transition-all duration-200 text-sm uppercase tracking-wide font-mono text-white ${variantClass(t.variant)} ${t.leaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}
              role="status"
            >
              <ToastIcon variant={t.variant} />
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}

function variantClass(variant: ToastVariant): string {
  switch (variant) {
    case 'error':
      return 'bg-red-600 border-red-600';
    case 'warn':
      return 'bg-yellow-500 border-yellow-500';
    case 'success':
    case 'info':
    default:
      return 'bg-orange-500 border-orange-500';
  }
}

function ToastIcon({ variant }: Readonly<{ variant: ToastVariant }>) {
  if (variant === 'error') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    );
  }
  if (variant === 'warn') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (message, options) => {
        console.log(`[toast:${options?.variant ?? 'success'}] ${message}`);
      },
    };
  }
  return ctx;
}
