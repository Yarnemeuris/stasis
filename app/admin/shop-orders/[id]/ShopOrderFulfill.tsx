'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/app/components/Toast';
import { detectCarrier, trackingUrl, carrierLabel } from '@/lib/tracking';
import type { OrderDetail } from './page';

interface Props {
  order: OrderDetail;
  onChange: () => Promise<void> | void;
}

export default function ShopOrderFulfill({ order, onChange }: Readonly<Props>) {
  const { showToast } = useToast();
  const [fulfillUsd, setFulfillUsd] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);

  const detectedCarrier = useMemo(() => detectCarrier(tracking), [tracking]);
  const trackingPreview = useMemo(() => {
    const t = tracking.trim();
    if (!t || !detectedCarrier) return null;
    const url = trackingUrl(detectedCarrier, t);
    return url ? { url, label: carrierLabel(detectedCarrier) } : null;
  }, [tracking, detectedCarrier]);

  const usdCents = (() => {
    const n = Number(fulfillUsd);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  })();

  const estimatedUsd = (order.estimatedUsdCents / 100).toFixed(2);

  const handleFulfill = async () => {
    if (usdCents == null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/shop-orders/${order.id}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillmentUsdCents: usdCents,
          trackingNumber: tracking.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to fulfill', { variant: 'error' });
        return;
      }
      showToast('Order fulfilled', { variant: 'success' });
      setFulfillUsd('');
      setTracking('');
      await onChange();
    } catch {
      showToast('Network error', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-4">
      <h2 className="text-orange-500 text-sm uppercase tracking-wide">Fulfill</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-cream-50 text-xs uppercase block mb-1">Fulfillment cost (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={fulfillUsd}
            onChange={(e) => setFulfillUsd(e.target.value)}
            className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm font-mono focus:border-orange-500 focus:outline-none"
          />
          <p className="text-cream-500 text-xs mt-1 uppercase tracking-wide">Est. ${estimatedUsd}</p>
        </div>
        <div>
          <label className="text-cream-50 text-xs uppercase block mb-1">Tracking number</label>
          <input
            type="text"
            placeholder="Optional"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm font-mono focus:border-orange-500 focus:outline-none"
          />
          <p className="text-cream-500 text-xs mt-1 uppercase tracking-wide">
            {trackingPreview ? (
              <>{trackingPreview.label} · <a href={trackingPreview.url} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">Track →</a></>
            ) : tracking.trim() ? (
              'Carrier not auto-detected'
            ) : (
              'Leave blank for non-physical fulfillment'
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleFulfill}
        disabled={busy || usdCents == null}
        className="px-4 py-2.5 text-sm uppercase tracking-wide font-bold bg-orange-500 text-cream-50 hover:bg-orange-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? 'Working…' : 'Mark as fulfilled'}
      </button>
    </div>
  );
}
