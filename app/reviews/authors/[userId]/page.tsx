'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import Link from 'next/link';
import CopyInline from '@/app/components/CopyInline';

interface AuthorUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  slackId: string | null;
}

interface NoteData {
  user: AuthorUser;
  note: { content: string; updatedAt: string } | null;
}

export default function AuthorNotePage({
  params,
}: Readonly<{ params: Promise<{ userId: string }> }>) {
  const { userId } = use(params);
  const [data, setData] = useState<NoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const noteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reviewer-notes/${userId}`);
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const d: NoteData = await res.json();
        setData(d);
        setInternalNote(d.note?.content ?? '');
        setSavedAt(d.note?.updatedAt ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const saveNote = useCallback(async (content: string) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/reviewer-notes/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSavedAt(updated.updatedAt);
        setSaveStatus('saved');
      } else {
        setSaveStatus('idle');
      }
    } catch {
      setSaveStatus('idle');
    }
  }, [userId]);

  function handleNoteChange(value: string) {
    setInternalNote(value);
    setSaveStatus('saving');
    if (noteTimeout.current) clearTimeout(noteTimeout.current);
    noteTimeout.current = setTimeout(() => saveNote(value), 1000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="loader" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-cream-100 border-2 border-cream-400 p-6">
          <h1 className="text-brown-800 text-sm uppercase tracking-wider mb-2">Author not found</h1>
          <p className="text-cream-600 text-sm">No user with id <span className="font-mono">{userId}</span>.</p>
          <Link href="/reviews/authors" className="text-orange-500 hover:text-orange-600 text-sm uppercase tracking-wider mt-4 inline-block">
            ← Back to author search
          </Link>
        </div>
      </div>
    );
  }

  const { user } = data;
  const savedLabel = formatSavedLabel(savedAt, saveStatus);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link
        href="/reviews/authors"
        className="text-brown-800 hover:text-orange-500 text-xs uppercase tracking-wider transition-colors inline-block"
      >
        ← Back to author search
      </Link>

      {/* ── Author header ── */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <div className="flex items-center gap-4">
          {user.image ? (
            <img src={user.image} alt="" className="w-12 h-12 border-2 border-cream-400" />
          ) : (
            <div className="w-12 h-12 border-2 border-cream-400 bg-cream-200" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-brown-800 text-lg truncate">
              {user.name || user.email}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] font-mono uppercase tracking-wider">
              {user.name && (
                <CopyInline value={user.email} toastLabel="Email" className="text-cream-600 normal-case px-1 -mx-1">
                  {user.email}
                </CopyInline>
              )}
              {user.slackId && (
                <>
                  {user.name && <span className="text-cream-400">·</span>}
                  <CopyInline value={user.slackId} toastLabel="Slack ID" className="text-cream-600 px-1 -mx-1">
                    SLACK {user.slackId}
                  </CopyInline>
                </>
              )}
              {(user.name || user.slackId) && <span className="text-cream-400">·</span>}
              <CopyInline value={user.id} toastLabel="User ID" className="text-cream-600 px-1 -mx-1">
                ID {user.id}
              </CopyInline>
            </div>
          </div>
        </div>
      </div>

      {/* ── Internal Notes Card ── */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <div className="flex items-baseline justify-between mb-2 gap-3">
          <h2 className="text-brown-800 text-sm uppercase tracking-wider">
            Internal Notes <span className="text-cream-600 normal-case">(shared across reviewers)</span>
          </h2>
          <span className="text-cream-600 text-xs whitespace-nowrap">{savedLabel}</span>
        </div>
        <textarea
          value={internalNote}
          onChange={(e) => handleNoteChange(e.target.value)}
          className="w-full h-48 px-3 py-2 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500 resize-y"
          placeholder="Add notes about this author..."
        />
      </div>
    </div>
  );
}

function formatSavedLabel(updatedAt: string | null, status: 'idle' | 'saving' | 'saved'): string {
  if (status === 'saving') return 'Saving…';
  if (!updatedAt) return status === 'saved' ? 'Saved' : '';
  const ts = new Date(updatedAt);
  const diffMs = Date.now() - ts.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'Saved just now';
  if (diffSec < 60) return `Saved ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Saved ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Saved ${diffHr}h ago`;
  return `Saved ${ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
