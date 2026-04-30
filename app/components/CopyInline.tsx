'use client';

import { useState, MouseEvent } from 'react';
import { useToast } from '@/app/components/Toast';

interface CopyInlineProps {
  value: string;
  toastLabel?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Inline copy-to-clipboard span. Wraps arbitrary children (e.g. an "ID abc123"
 * span) and copies `value` on click with a toast + brief flash.
 */
export default function CopyInline({
  value,
  toastLabel = 'Value',
  className = '',
  children,
}: Readonly<CopyInlineProps>) {
  const [flashing, setFlashing] = useState(false);
  const { showToast } = useToast();

  async function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setFlashing(false);
      requestAnimationFrame(() => {
        setFlashing(true);
        setTimeout(() => setFlashing(false), 400);
      });
      showToast(`${toastLabel} copied`, { variant: 'success', durationMs: 1500 });
    } catch {
      showToast('Copy failed', { variant: 'error' });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Copy ${toastLabel.toLowerCase()}`}
      className={`cursor-pointer transition-colors ${flashing ? 'bg-orange-500/25' : 'hover:bg-cream-300'} ${className}`}
    >
      {children}
    </button>
  );
}
