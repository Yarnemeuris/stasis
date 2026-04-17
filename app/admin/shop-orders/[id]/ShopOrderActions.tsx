'use client';

import { useState } from 'react';
import HoldButton from '@/app/components/HoldButton';
import { useToast } from '@/app/components/Toast';
import type { OrderDetail } from './page';

interface Props {
  order: OrderDetail;
  onChange: () => Promise<void> | void;
}

export default function ShopOrderActions({ order, onChange }: Readonly<Props>) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const isTerminal = order.status === 'FULFILLED' || order.status === 'REJECTED' || order.status === 'CANCELLED';
  const isOnHold = order.status === 'ON_HOLD';

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Action failed', { variant: 'error' });
        return false;
      }
      return true;
    } catch {
      showToast('Network error', { variant: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const trimmedReason = reason.trim();

  const handleHold = async () => {
    const ok = await post(`/api/admin/shop-orders/${order.id}/hold`, trimmedReason ? { reason: trimmedReason } : {});
    if (ok) {
      showToast('Order on hold', { variant: 'success' });
      setReason('');
      await onChange();
    }
  };

  const handleUnhold = async () => {
    const ok = await post(`/api/admin/shop-orders/${order.id}/unhold`);
    if (ok) {
      showToast('Hold removed', { variant: 'success' });
      await onChange();
    }
  };

  const handleReject = async () => {
    const ok = await post(`/api/admin/shop-orders/${order.id}/reject`, trimmedReason ? { reason: trimmedReason } : {});
    if (ok) {
      showToast(`Rejected · ${order.totalBitsCost.toLocaleString()} bits refunded`, { variant: 'success', durationMs: 5000 });
      setReason('');
      await onChange();
    }
  };

  const handleRevert = async () => {
    if (!confirm('Revert this order back to pending? If rejected, this will debit the refunded bits from the user.')) return;
    const ok = await post(`/api/admin/shop-orders/${order.id}/revert`);
    if (ok) {
      showToast('Reverted to pending', { variant: 'success' });
      await onChange();
    }
  };

  if (isTerminal) {
    return (
      <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-3">
        <h2 className="text-orange-500 text-sm uppercase tracking-wide">Actions</h2>
        <p className="text-cream-200 text-sm">
          This order is {order.status.toLowerCase().replace('_', ' ')}. Revert to pending to reopen it.
        </p>
        <button
          type="button"
          onClick={handleRevert}
          disabled={busy}
          className="px-4 py-2 text-xs uppercase tracking-wide bg-brown-900 text-cream-200 border border-cream-500/20 hover:border-orange-500 hover:text-orange-500 cursor-pointer disabled:opacity-50 transition-colors"
        >
          {busy ? 'Working…' : 'Revert to pending'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-orange-500 text-sm uppercase tracking-wide">Hold or reject</h2>
        <p className="text-cream-500 text-xs">Internal only — never sent to user</p>
      </div>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)…"
        rows={3}
        className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isOnHold ? (
          <button
            type="button"
            onClick={handleUnhold}
            disabled={busy}
            className="px-4 py-3 text-sm uppercase tracking-wide font-bold bg-yellow-500/20 text-yellow-500 border-2 border-yellow-500/50 hover:bg-yellow-500/30 cursor-pointer disabled:opacity-50 transition-colors"
          >
            {busy ? 'Working…' : 'Remove hold'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleHold}
            disabled={busy}
            className="px-4 py-3 text-sm uppercase tracking-wide font-bold bg-yellow-500/20 text-yellow-500 border-2 border-yellow-500/50 hover:bg-yellow-500/30 cursor-pointer disabled:opacity-50 transition-colors"
          >
            {busy ? 'Working…' : 'Put on hold'}
          </button>
        )}

        <HoldButton
          onComplete={handleReject}
          label="Hold to reject"
          holdingLabel="Rejecting…"
          variant="danger"
          durationMs={1500}
          disabled={busy}
        />
      </div>

      <p className="text-cream-500 text-xs">
        Rejecting refunds <span className="text-cream-200 font-mono">{order.totalBitsCost.toLocaleString()}</span> bits and notifies the user.
      </p>
    </div>
  );
}
