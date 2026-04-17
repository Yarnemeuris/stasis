'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StatusPill from '@/app/components/StatusPill';
import type { ShopOrderStatus } from '@/app/generated/prisma/enums';

type SortKey = 'longest_waiting' | 'newest' | 'oldest' | 'price_desc' | 'price_asc';

interface OrderRow {
  id: string;
  orderNumber: number;
  quantity: number;
  totalBitsCost: number;
  estimatedUsdCents: number;
  status: ShopOrderStatus;
  placedAt: string;
  fulfilledAt: string | null;
  heldAt: string | null;
  rejectedAt: string | null;
  trackingNumber: string | null;
  user: { id: string; name: string | null; email: string; image: string | null };
  shopItem: { id: string; name: string; imageUrl: string | null };
}

interface ApiResponse {
  orders: OrderRow[];
  counts: Record<ShopOrderStatus, number>;
  itemOptions: { id: string; name: string }[];
}

const STATUSES: ShopOrderStatus[] = ['PENDING', 'ON_HOLD', 'FULFILLED', 'REJECTED', 'CANCELLED'];

function formatRelative(iso: string): { label: string; days: number } {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) {
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return { label: 'just now', days: 0 };
    return { label: `${hours}h ago`, days: 0 };
  }
  if (days === 1) return { label: '1d ago', days };
  return { label: `${days}d ago`, days };
}

function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminShopOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [itemId, setItemId] = useState(searchParams.get('itemId') ?? '');
  const [statuses, setStatuses] = useState<Set<ShopOrderStatus>>(() => {
    const raw = searchParams.get('status') ?? '';
    return new Set(raw.split(',').filter((s): s is ShopOrderStatus => (STATUSES as string[]).includes(s)));
  });
  const [sort, setSort] = useState<SortKey>((searchParams.get('sort') as SortKey) ?? 'longest_waiting');
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Sync filter/sort state to URL (replaceState so history isn't polluted).
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (itemId) params.set('itemId', itemId);
    if (statuses.size > 0) params.set('status', Array.from(statuses).join(','));
    if (sort !== 'longest_waiting') params.set('sort', sort);
    const qs = params.toString();
    router.replace(qs ? `/admin/shop-orders?${qs}` : '/admin/shop-orders', { scroll: false });
  }, [debouncedSearch, itemId, statuses, sort, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (itemId) params.set('itemId', itemId);
    if (statuses.size > 0) params.set('status', Array.from(statuses).join(','));
    params.set('sort', sort);
    try {
      const res = await fetch(`/api/admin/shop-orders?${params.toString()}`);
      if (!res.ok) {
        setFetchError('Failed to load shop orders.');
        return;
      }
      setData(await res.json());
    } catch {
      setFetchError('Network error — could not load shop orders.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, itemId, statuses, sort]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleStatus = (s: ShopOrderStatus) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const summary = useMemo(() => {
    if (!data) return null;
    const { counts } = data;
    return `${counts.PENDING} pending · ${counts.ON_HOLD} on hold · ${counts.FULFILLED} fulfilled · ${counts.REJECTED} rejected`;
  }, [data]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Shop Orders</h1>
        <p className="text-cream-200 text-sm mt-1">
          {data ? `Showing ${data.orders.length} order${data.orders.length === 1 ? '' : 's'}.` : 'Loading…'}
          {summary && <span className="ml-2 text-cream-500">· {summary}</span>}
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-brown-800 border-2 border-cream-500/20 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1">
            <label className="text-cream-50 text-xs uppercase block mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="email, name, Slack ID, order #, tracking"
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div className="lg:w-64">
            <label className="text-cream-50 text-xs uppercase block mb-1">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            >
              <option value="">All items</option>
              {data?.itemOptions.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div className="lg:w-56">
            <label className="text-cream-50 text-xs uppercase block mb-1">Sort</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            >
              <option value="longest_waiting">Longest-waiting first</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="price_desc">Price (high → low)</option>
              <option value="price_asc">Price (low → high)</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => {
            const active = statuses.has(s);
            const count = data?.counts[s] ?? 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`px-3 py-1.5 text-xs uppercase tracking-wide transition-colors cursor-pointer border ${
                  active
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-brown-900 text-cream-200 border-cream-500/20 hover:border-cream-500/40'
                }`}
              >
                {s.replace('_', ' ')} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
              </button>
            );
          })}
          {statuses.size > 0 && (
            <button
              type="button"
              onClick={() => setStatuses(new Set())}
              className="px-3 py-1.5 text-xs uppercase tracking-wide text-cream-500 hover:text-cream-50 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Orders table */}
      <div className="bg-brown-800 border-2 border-cream-500/20 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center"><div className="flex items-center justify-center"><div className="loader" /></div></div>
        ) : fetchError ? (
          <div className="p-8 text-center"><p className="text-red-600 text-sm">{fetchError}</p></div>
        ) : !data || data.orders.length === 0 ? (
          <div className="p-8 text-center"><p className="text-cream-50">No shop orders found.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-brown-800 z-10">
              <tr className="border-b-2 border-cream-500/20">
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">#</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">User</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Item</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Qty</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Bits</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Est. USD</th>
                <th className="text-center text-cream-50 text-xs uppercase px-4 py-3">Status</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => {
                const { label, days } = formatRelative(o.placedAt);
                const isPending = o.status === 'PENDING' || o.status === 'ON_HOLD';
                const ageClass = !isPending
                  ? 'text-cream-200'
                  : days >= 6 ? 'text-red-600' : days >= 3 ? 'text-yellow-500' : 'text-cream-200';
                const highlighted = o.id === highlightId;
                return (
                  <tr
                    key={o.id}
                    className={`border-b border-cream-500/10 last:border-b-0 hover:bg-cream-500/5 cursor-pointer transition-colors ${highlighted ? 'bg-orange-500/10 animate-pulse' : ''}`}
                    onClick={() => router.push(`/admin/shop-orders/${o.id}`)}
                  >
                    <td className="px-4 py-3 text-orange-500 font-mono">#{o.orderNumber}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/profile/${o.user.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 hover:text-orange-500 transition-colors group"
                      >
                        <img src={o.user.image || '/default_slack.png'} alt="" className="w-6 h-6 border border-cream-500/20" />
                        <div className="min-w-0">
                          <p className="text-cream-50 text-sm truncate group-hover:text-orange-500 group-hover:underline">{o.user.name || o.user.email}</p>
                          {o.user.name && <p className="text-cream-200 text-xs truncate">{o.user.email}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {o.shopItem.imageUrl && (
                          <img src={o.shopItem.imageUrl} alt="" className="w-8 h-8 object-contain border border-cream-500/20" />
                        )}
                        <span className="text-cream-50">{o.shopItem.name}</span>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 text-cream-50 font-mono">{o.quantity}</td>
                    <td className="text-right px-4 py-3 text-cream-50 font-mono">{o.totalBitsCost.toLocaleString()}</td>
                    <td className="text-right px-4 py-3 text-cream-200 font-mono">${(o.estimatedUsdCents / 100).toFixed(2)}</td>
                    <td className="text-center px-4 py-3">
                      <StatusPill status={o.status} />
                    </td>
                    <td className={`text-right px-4 py-3 whitespace-nowrap font-mono ${ageClass}`}>
                      <span title={formatAbsolute(o.placedAt)}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
