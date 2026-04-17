'use client';

import { useState } from 'react';
import { useToast } from '@/app/components/Toast';

interface CopyableFieldProps {
  label: string;
  value: string | null | undefined;
  toastLabel?: string;
  className?: string;
}

/**
 * Single-line "Label: value" row where clicking anywhere on the row copies the
 * value to the clipboard, flashes orange, and shows a toast. A copy icon
 * appears on the right while hovering.
 */
export default function CopyableField({
  label,
  value,
  toastLabel,
  className = '',
}: Readonly<CopyableFieldProps>) {
  const [flashing, setFlashing] = useState(false);
  const { showToast } = useToast();

  const display = value ?? '—';
  const canCopy = !!value;

  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(value);
      // Re-trigger flash even when one is already running so back-to-back
      // copies still pulse rather than appearing inert.
      setFlashing(false);
      requestAnimationFrame(() => {
        setFlashing(true);
        setTimeout(() => setFlashing(false), 500);
      });
      showToast(`${toastLabel ?? label} copied`, { variant: 'success', durationMs: 2000 });
    } catch {
      showToast('Copy failed', { variant: 'error' });
    }
  };

  // Hover bg uses cream/5 normally; flash uses orange/25 with !important-equivalent
  // ordering so it stays visible even while hovered.
  const baseBg = canCopy ? 'hover:bg-cream-500/5' : '';
  const flashBg = flashing ? '!bg-orange-500/25 !border-orange-500/60' : '';

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!canCopy}
      className={`group w-full text-left flex items-center gap-2 border border-transparent px-2 py-1.5 -mx-2 transition-colors ${canCopy ? 'cursor-pointer hover:border-cream-500/20' : 'cursor-default'} ${baseBg} ${flashBg} ${className}`}
    >
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-cream-200 text-xs uppercase tracking-wide">{label}</span>
        <span className={`text-sm break-all ${canCopy ? 'text-cream-50' : 'text-cream-500'}`}>{display}</span>
      </span>
      {canCopy && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-cream-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          aria-hidden
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
