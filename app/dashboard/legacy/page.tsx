'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Archive, Upload, Search, ChevronLeft, ChevronRight,
  Globe, Users, SkipForward,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { EmailLink, PhoneLink } from '@/components/ui/ContactLink';
import { auth } from '@/lib/firebase/config';
import { cn } from '@/lib/utils/helpers';
import type { LegacyCv } from '@/types';

// ── Rank color map ────────────────────────────────────────────
function rankColor(rank: string): string {
  const r = rank.toLowerCase();
  if (r.includes('master') || r.includes('chief officer') || r.includes('chief engineer')) {
    return 'bg-navy-100 text-navy-800 border-navy-200';
  }
  if (r.includes('second officer') || r.includes('third officer') || r.includes('2nd officer') || r.includes('3rd officer')) {
    return 'bg-blue-100 text-blue-800 border-blue-200';
  }
  if (r.includes('engineer')) {
    return 'bg-orange-100 text-orange-800 border-orange-200';
  }
  if (r.includes('rating') || r.includes('able') || r.includes('ordinary') || r.includes('bosun') || r.includes('deck')) {
    return 'bg-teal-100 text-teal-800 border-teal-200';
  }
  if (r.includes('cook') || r.includes('steward') || r.includes('catering')) {
    return 'bg-pink-100 text-pink-800 border-pink-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

// ── Avatar helpers ────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const avatarColors = [
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % avatarColors.length;
  return avatarColors[h];
}

// ── Types ─────────────────────────────────────────────────────
type ImportState = 'idle' | 'importing' | 'done' | 'error';

interface PageData {
  records: LegacyCv[];
  hasMore: boolean;
  nextId:  string | null;
  total:   number;
}

const PAGE_LIMIT = 50;

// ── Main page ─────────────────────────────────────────────────
export default function LegacyPage() {
  const [pageData,     setPageData]     = useState<PageData | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [importState,  setImportState]  = useState<ImportState>('idle');
  const [importCount,  setImportCount]  = useState(0);
  const [importSkip,   setImportSkip]   = useState(0);
  const [importError,  setImportError]  = useState('');
  const [isDragging,   setIsDragging]   = useState(false);

  // Search state
  const [searchInput,  setSearchInput]  = useState('');   // what user types
  const [activeSearch, setActiveSearch] = useState('');   // debounced, sent to API

  // Pagination — separate stacks per search term so switching query resets to page 1
  const [cursorStack,  setCursorStack]  = useState<Array<string | null>>([null]);
  const [currentPage,  setCurrentPage]  = useState(0);

  const dragCount  = useRef(0);
  const fileInput  = useRef<HTMLInputElement>(null);
  const debounceId = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch page ────────────────────────────────────────────
  const fetchPage = useCallback(async (afterId: string | null, search: string) => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken() ?? '';
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (afterId) params.set('afterId', afterId);
      if (search)  params.set('search',  search.trim());

      const res  = await fetch(`/api/legacy-cv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { success: boolean; data?: PageData; error?: string };
      if (json.success && json.data) setPageData(json.data);
    } catch (err) {
      console.error('[legacy page] fetch error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchPage(null, ''); }, [fetchPage]);

  // ── Debounce search → fetch from page 1 ──────────────────
  useEffect(() => {
    if (debounceId.current) clearTimeout(debounceId.current);
    debounceId.current = setTimeout(() => {
      const trimmed = searchInput.trim().toLowerCase();
      if (trimmed === activeSearch) return;           // no real change
      setActiveSearch(trimmed);
      setCursorStack([null]);
      setCurrentPage(0);
      fetchPage(null, trimmed);
    }, 350);
    return () => { if (debounceId.current) clearTimeout(debounceId.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // ── Import JSON ───────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setImportState('error');
      setImportError('Only .json files are supported.');
      return;
    }
    setImportState('importing');
    setImportError('');

    try {
      const text   = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown[]>).records ?? [];

      const token = await auth.currentUser?.getIdToken() ?? '';
      const res   = await fetch('/api/legacy-cv', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ records }),
      });
      const json = await res.json() as {
        success: boolean; imported?: number; skipped?: number; error?: string;
      };

      if (json.success) {
        setImportCount(json.imported ?? 0);
        setImportSkip(json.skipped ?? 0);
        setImportState('done');
        // Reload list from start (same search)
        setCursorStack([null]);
        setCurrentPage(0);
        fetchPage(null, activeSearch);
      } else {
        setImportState('error');
        setImportError(json.error ?? 'Import failed.');
      }
    } catch (err) {
      setImportState('error');
      setImportError(err instanceof Error ? err.message : 'Failed to read file.');
    }
  }

  // ── Drag handlers ─────────────────────────────────────────
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCount.current++;
    if (dragCount.current === 1) setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCount.current--;
    if (dragCount.current === 0) setIsDragging(false);
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCount.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── Pagination ────────────────────────────────────────────
  function goNext() {
    if (!pageData?.hasMore || !pageData.nextId) return;
    const nextAfter = pageData.nextId;
    const newPage   = currentPage + 1;
    setCursorStack(s => { const c = [...s]; c[newPage] = nextAfter; return c; });
    setCurrentPage(newPage);
    fetchPage(nextAfter, activeSearch);
  }

  function goPrev() {
    if (currentPage === 0) return;
    const prevPage   = currentPage - 1;
    const prevCursor = cursorStack[prevPage] ?? null;
    setCurrentPage(prevPage);
    fetchPage(prevCursor, activeSearch);
  }

  // ── Derived ───────────────────────────────────────────────
  const total   = pageData?.total ?? 0;
  const showing = pageData?.records.length ?? 0;
  const from    = currentPage * PAGE_LIMIT + 1;
  const to      = currentPage * PAGE_LIMIT + showing;
  const records = pageData?.records ?? [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Old CVs"
        subtitle="Legacy seafarer database — import and browse historical CV records"
      />

      <div className="flex-1 overflow-y-auto bg-surface-50 p-6 space-y-6">

        {/* ── Import zone ──────────────────────────────────── */}
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={cn(
            'relative rounded-2xl border-2 border-dashed transition-all duration-200 p-6',
            isDragging
              ? 'border-primary-400 bg-primary-50/60 shadow-lg shadow-primary-100/50'
              : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/10',
          )}
        >
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Icon */}
            <div className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors',
              isDragging ? 'bg-primary-100' : 'bg-slate-100',
            )}>
              {importState === 'importing'
                ? <div className="h-6 w-6 animate-spin rounded-full border-2 border-transparent border-t-primary-500" />
                : <Upload className={cn('h-6 w-6', isDragging ? 'text-primary-600' : 'text-slate-400')} />
              }
            </div>

            {/* Status text */}
            <div className="flex-1 text-center sm:text-left">
              {importState === 'idle' || importState === 'error' ? (
                <>
                  <p className="text-sm font-semibold text-slate-700">
                    {isDragging ? 'Release to import' : 'Drop a JSON file here, or click to browse'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    JSON array — fields: Name, Nationality, Rank, Email, M1/M2/M3
                  </p>
                  {importState === 'error' && (
                    <p className="text-xs text-red-500 mt-1">{importError}</p>
                  )}
                </>
              ) : importState === 'importing' ? (
                <p className="text-sm font-semibold text-slate-700 animate-pulse">Importing records…</p>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-emerald-700">
                    {importCount.toLocaleString()} record{importCount !== 1 ? 's' : ''} imported
                    {importSkip > 0 && (
                      <span className="ml-2 text-amber-600 font-medium">
                        · {importSkip.toLocaleString()} duplicate{importSkip !== 1 ? 's' : ''} skipped
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Records with matching email or name were not imported again
                  </p>
                </div>
              )}
            </div>

            {/* Browse button */}
            <button
              onClick={() => { setImportState('idle'); fileInput.current?.click(); }}
              disabled={importState === 'importing'}
              className="shrink-0 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {importState === 'done' ? 'Import More' : 'Browse File'}
            </button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
        </div>

        {/* ── Search + stats ────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name across all records…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {/* Clear button */}
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
            {total > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {activeSearch
                  ? `${total.toLocaleString()} match${total !== 1 ? 'es' : ''}`
                  : `${total.toLocaleString()} total records`
                }
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1.5 text-primary-500">
                <div className="h-3 w-3 animate-spin rounded-full border border-transparent border-t-primary-500" />
                Searching…
              </span>
            )}
          </div>
        </div>

        {/* ── Records list ─────────────────────────────────── */}
        {!loading && records.length === 0 && total === 0 && !activeSearch ? (
          /* Empty state — no data at all */
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100">
              <Archive className="h-10 w-10 text-slate-300" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-700">No legacy CVs yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Drop a JSON file above to import your first batch of seafarer records
              </p>
            </div>
          </div>
        ) : !loading && records.length === 0 && activeSearch ? (
          /* No search results */
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm gap-2">
            <Search className="h-8 w-8 text-slate-200" />
            <p>No records match &ldquo;{searchInput}&rdquo;</p>
            <p className="text-xs text-slate-300">Try a different name prefix</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid gap-3">
              {records.map((cv, idx) => (
                <motion.div
                  key={cv.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.25) }}
                  className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Avatar */}
                  <div className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm',
                    avatarColor(cv.name),
                  )}>
                    {initials(cv.name)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{cv.name || '(No name)'}</p>

                      {cv.nationality && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          <Globe className="h-3 w-3 shrink-0" />
                          {cv.nationality}
                        </span>
                      )}

                      {cv.rank && (
                        <span className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                          rankColor(cv.rank),
                        )}>
                          {cv.rank}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {cv.email && <EmailLink email={cv.email} size="xs" truncate />}
                      {cv.phones.map((p, i) => (
                        <PhoneLink key={i} phone={p} size="xs" />
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}

        {/* ── Pagination ───────────────────────────────────── */}
        {total > PAGE_LIMIT || currentPage > 0 ? (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-400">
              {showing > 0
                ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} records`
                : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                disabled={currentPage === 0 || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="text-xs text-slate-400 font-medium px-1">
                Page {currentPage + 1}
              </span>
              <button
                onClick={goNext}
                disabled={!pageData?.hasMore || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Skip info banner (shown once per import if any skipped) */}
        <AnimatePresence>
          {importState === 'done' && importSkip > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700"
            >
              <SkipForward className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <strong>{importSkip.toLocaleString()}</strong> record{importSkip !== 1 ? 's were' : ' was'} skipped
                because a matching email or name already exists in the database.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
