'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import CopyInline from '@/app/components/CopyInline';

interface SearchUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  slackId: string | null;
  hasNote: boolean;
}

export default function AuthorSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setSearched(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const myReqId = ++reqIdRef.current;
      try {
        const res = await fetch(`/api/reviewer-notes/search?q=${encodeURIComponent(trimmed)}`);
        if (myReqId !== reqIdRef.current) return;
        if (res.ok) {
          const data = await res.json();
          setResults(data.users);
          setSearched(true);
        }
      } finally {
        if (myReqId === reqIdRef.current) setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link
        href="/reviews"
        className="text-brown-800 hover:text-orange-500 text-xs uppercase tracking-wider transition-colors inline-block"
      >
        ← Review Queue
      </Link>

      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h1 className="text-brown-800 text-sm uppercase tracking-wider mb-1">Author Search</h1>
        <p className="text-cream-600 text-xs mb-4">Search by name, email, Slack ID, or user ID to read or edit internal notes about that author.</p>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search authors…"
          className="w-full px-3 py-2 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500"
        />
        <p className="text-cream-600 text-xs mt-2 h-4">
          {query.trim().length > 0 && query.trim().length < 2 && 'Keep typing…'}
          {searching && 'Searching…'}
          {!searching && searched && results.length === 0 && 'No matches.'}
        </p>
      </div>

      {results.length > 0 && (
        <ul className="bg-cream-100 border-2 border-cream-400 divide-y divide-cream-400">
          {results.map((u) => (
            <li key={u.id} className="flex items-center gap-3 p-4">
              {u.image ? (
                <img src={u.image} alt="" className="w-8 h-8 border border-cream-400 flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 border border-cream-400 bg-cream-200 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/reviews/authors/${u.id}`}
                    className="text-brown-800 text-sm truncate hover:text-orange-500 transition-colors"
                  >
                    {u.name || u.email}
                  </Link>
                  {u.hasNote && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 bg-orange-500/15 text-orange-600 border border-orange-500/30 whitespace-nowrap">
                      Has note
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-[10px] font-mono uppercase tracking-wider">
                  {u.name && (
                    <CopyInline value={u.email} toastLabel="Email" className="text-cream-600 normal-case px-1 -mx-1">
                      {u.email}
                    </CopyInline>
                  )}
                  {u.slackId && (
                    <>
                      {u.name && <span className="text-cream-400">·</span>}
                      <CopyInline value={u.slackId} toastLabel="Slack ID" className="text-cream-600 px-1 -mx-1">
                        SLACK {u.slackId}
                      </CopyInline>
                    </>
                  )}
                  {(u.name || u.slackId) && <span className="text-cream-400">·</span>}
                  <CopyInline value={u.id} toastLabel="User ID" className="text-cream-600 px-1 -mx-1">
                    ID {u.id}
                  </CopyInline>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
