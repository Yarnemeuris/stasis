'use client';

import { useEffect, useRef, useState } from 'react';

interface HoldButtonProps {
  onComplete: () => void | Promise<void>;
  label: string;
  holdingLabel?: string;
  durationMs?: number;
  disabled?: boolean;
  variant?: 'primary' | 'danger';
  fullWidth?: boolean;
}

/**
 * Press-and-hold button. Used on the shop page (Hold to Buy) and the admin
 * shop-order detail page (Hold to Reject). The hold itself is the gate — there
 * is no confirm dialog in either place.
 */
export default function HoldButton({
  onComplete,
  label,
  holdingLabel,
  durationMs = 3000,
  disabled = false,
  variant = 'primary',
  fullWidth = true,
}: Readonly<HoldButtonProps>) {
  const [filling, setFilling] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const start = () => {
    if (disabled) return;
    completedRef.current = false;
    setFilling(true);
    holdTimerRef.current = setTimeout(async () => {
      holdTimerRef.current = null;
      completedRef.current = true;
      try {
        await onComplete();
      } finally {
        setFilling(false);
      }
    }, durationMs);
  };

  const cancel = () => {
    if (completedRef.current) return;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setFilling(false);
  };

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  const accentText = variant === 'danger' ? 'text-red-600' : 'text-orange-500';
  const accentBg = variant === 'danger' ? 'bg-red-600' : 'bg-orange-500';
  const border = variant === 'danger' ? 'border-red-600' : 'border-orange-500';
  const baseBg = variant === 'danger' ? 'bg-brown-900' : 'bg-cream-200';
  const unfilledText = variant === 'danger' ? 'text-red-600' : 'text-orange-500';
  const filledText = variant === 'danger' ? 'text-cream-50' : 'text-cream-100';

  const text = filling ? (holdingLabel ?? label) : label;

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      disabled={disabled}
      className={`relative overflow-hidden border-2 px-6 py-3 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${border} ${baseBg} ${fullWidth ? 'w-full' : ''}`}
      data-filling={filling ? 'true' : 'false'}
    >
      <div
        className={`absolute inset-y-0 left-0 pointer-events-none ${accentBg}`}
        style={{
          width: filling ? '100%' : '0%',
          transition: filling ? `width ${durationMs}ms linear` : 'width 200ms ease-out',
        }}
      />
      <div
        className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
        style={{
          clipPath: filling ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: filling ? `clip-path ${durationMs}ms linear` : 'clip-path 200ms ease-out',
        }}
      >
        <span className={`${filledText} uppercase tracking-wide text-sm font-bold`}>{text}</span>
      </div>
      <span className={`relative ${accentText !== unfilledText ? unfilledText : accentText} uppercase tracking-wide text-sm font-bold`}>
        {text}
      </span>
    </button>
  );
}
