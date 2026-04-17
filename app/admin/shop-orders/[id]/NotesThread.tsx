'use client';

import { useState } from 'react';
import { useToast } from '@/app/components/Toast';

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string; image: string | null };
}

interface Props {
  orderId: string;
  initialNotes: Note[];
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotesThread({ orderId, initialNotes }: Readonly<Props>) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/admin/shop-orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to post note', { variant: 'error' });
        return;
      }
      const data = await res.json();
      if (data.note) setNotes((prev) => [...prev, data.note]);
      setDraft('');
    } catch {
      showToast('Network error', { variant: 'error' });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="bg-brown-800 border-2 border-cream-500/20 p-5 space-y-4">
      <h2 className="text-orange-500 text-sm uppercase tracking-wide">Internal notes</h2>

      {/* Composer */}
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note (visible to admins only)…"
          rows={2}
          className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={post}
            disabled={posting || !draft.trim()}
            className="px-3 py-1.5 text-xs uppercase tracking-wide bg-orange-500 text-cream-50 hover:bg-orange-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting…' : 'Post note'}
          </button>
        </div>
      </div>

      {/* Thread */}
      {notes.length === 0 ? (
        <p className="text-cream-500 text-sm italic">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 border-t border-cream-500/10 pt-3 first:border-t-0 first:pt-0">
              <img src={n.author.image || '/default_slack.png'} alt="" className="w-8 h-8 border border-cream-500/20 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-cream-50 text-sm">{n.author.name || n.author.email}</p>
                  <p className="text-cream-500 text-xs">{formatRelative(n.createdAt)}</p>
                </div>
                <p className="text-cream-200 text-sm whitespace-pre-wrap mt-1">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
