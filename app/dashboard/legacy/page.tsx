'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Archive, Upload, Search, ChevronLeft, ChevronRight,
  Globe, Users, CheckCircle2, XCircle, Loader2, FileJson, RefreshCw,
  SlidersHorizontal, ChevronDown, ChevronUp, Anchor, ArrowUpDown, X,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { EmailLink, PhoneLink } from '@/components/ui/ContactLink';
import { auth } from '@/lib/firebase/config';
import { cn } from '@/lib/utils/helpers';
import { MARITIME_RANKS } from '@/lib/utils/ranks';
import type { LegacyCv } from '@/types';

// ── Rank color ────────────────────────────────────────────────
function rankColor(rank: string): string {
  const r = rank.toLowerCase();
  if (r.includes('master') || r.includes('chief officer') || r.includes('chief engineer'))
    return 'bg-navy-100 text-navy-800 border-navy-200';
  if (r.includes('second officer') || r.includes('third officer') || r.includes('2nd') || r.includes('3rd officer'))
    return 'bg-blue-100 text-blue-800 border-blue-200';
  if (r.includes('engineer'))
    return 'bg-orange-100 text-orange-800 border-orange-200';
  if (r.includes('rating') || r.includes('able') || r.includes('ordinary') || r.includes('bosun') || r.includes('deck'))
    return 'bg-teal-100 text-teal-800 border-teal-200';
  if (r.includes('cook') || r.includes('steward'))
    return 'bg-pink-100 text-pink-800 border-pink-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return '?';
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// ── Chunk helper ──────────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Import progress state ─────────────────────────────────────
interface ImportProgress {
  phase:        'reading' | 'importing' | 'stopping' | 'stopped' | 'done' | 'error';
  totalRecords: number;
  totalBatches: number;
  batchDone:    number;
  recordsDone:  number;
  imported:     number;
  skipped:      number;
  error?:       string;
  fileName:     string;
  startedAt:    number;
}

const BATCH_SIZE = 2000;
const PARALLEL   = 4;

// ── Page-level types ──────────────────────────────────────────
interface PageData {
  records: LegacyCv[];
  hasMore: boolean;
  nextId:  string | null;
  total:   number;
}

const PAGE_LIMIT = 50;

// ── Progress bar UI ───────────────────────────────────────────
function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Elapsed time label (rerenders every second) ───────────────
function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <>{m > 0 ? `${m}m ${s}s` : `${s}s`}</>;
}

// ── Reindex state ─────────────────────────────────────────────
type ReindexState = 'idle' | 'running' | 'done' | 'error';

// ── Filter state ──────────────────────────────────────────────
interface LegacyFilterState {
  search:        string;
  selectedRanks: string[];
  selectedNats:  string[];
  sort:          'newest' | 'name_az' | 'name_za';
}

const DEFAULT_FILTERS: LegacyFilterState = {
  search:        '',
  selectedRanks: [],
  selectedNats:  [],
  sort:          'newest',
};

// ── Small sub-components ──────────────────────────────────────
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 border border-primary-200 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700 whitespace-nowrap">
      {label}
      <button onClick={onRemove} className="hover:text-primary-900 transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
      <Icon className="h-3 w-3" />{children}
    </label>
  );
}

// ── LegacyCvFilters component ─────────────────────────────────
interface LegacyCvFiltersProps {
  filters:       LegacyFilterState;
  onChange:      (f: LegacyFilterState) => void;
  totalCount:    number;
  loading:       boolean;
  nationalities: string[];
  natsLoading:   boolean;
}

function LegacyCvFilters({
  filters, onChange, totalCount, loading, nationalities, natsLoading,
}: LegacyCvFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.selectedRanks.length > 0 ? 1 : 0) +
    (filters.selectedNats.length > 0 ? 1 : 0) +
    (filters.sort !== 'newest' ? 1 : 0);

  const hasActive = activeCount > 0;

  function set<K extends keyof LegacyFilterState>(key: K, val: LegacyFilterState[K]) {
    onChange({ ...filters, [key]: val });
  }

  function toggleRank(rank: string) {
    const next = filters.selectedRanks.includes(rank)
      ? filters.selectedRanks.filter(r => r !== rank)
      : [...filters.selectedRanks, rank];
    set('selectedRanks', next);
  }

  function toggleNat(nat: string) {
    const next = filters.selectedNats.includes(nat)
      ? filters.selectedNats.filter(n => n !== nat)
      : [...filters.selectedNats, nat];
    set('selectedNats', next);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── Search + toggle row ── */}
      <div className="flex items-center gap-2 px-3 py-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
          <input
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            placeholder="Search by name…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-300 focus:bg-white transition-all"
          />
          {filters.search && (
            <button onClick={() => set('search', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className={cn(
            'flex items-center gap-1.5 rounded-xl border px-3 h-9 text-sm font-semibold transition-all whitespace-nowrap',
            hasActive
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasActive && (
            <span className="flex items-center justify-center h-4 w-4 rounded-full bg-white/25 text-[10px] font-bold">
              {activeCount}
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {hasActive && (
          <button
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 h-9 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <X className="h-3 w-3" /> Reset
          </button>
        )}

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />}
          <span className="text-xs text-slate-400 whitespace-nowrap flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {totalCount > 0
              ? hasActive
                ? `${totalCount.toLocaleString()} match${totalCount !== 1 ? 'es' : ''}`
                : `${totalCount.toLocaleString()} total`
              : '—'}
          </span>
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-5">

          {/* Rank section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <FLabel icon={Anchor}>
                Rank
                {filters.selectedRanks.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                    {filters.selectedRanks.length}
                  </span>
                )}
              </FLabel>
              {filters.selectedRanks.length > 0 && (
                <button
                  onClick={() => set('selectedRanks', [])}
                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors mb-2"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(MARITIME_RANKS as readonly string[]).map(rank => {
                const on = filters.selectedRanks.includes(rank);
                return (
                  <button
                    key={rank}
                    onClick={() => toggleRank(rank)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all',
                      on
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-700',
                    )}
                  >
                    {rank}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nationality section */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <FLabel icon={Globe}>
                Nationality
                {filters.selectedNats.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                    {filters.selectedNats.length}
                  </span>
                )}
              </FLabel>
              {filters.selectedNats.length > 0 && (
                <button
                  onClick={() => set('selectedNats', [])}
                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors mb-2"
                >
                  Clear
                </button>
              )}
            </div>
            {natsLoading ? (
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-7 rounded-lg bg-slate-200 animate-pulse" style={{ width: `${60 + (i * 17) % 40}px` }} />
                ))}
              </div>
            ) : nationalities.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No nationalities indexed yet — click &quot;Fix Filters&quot; to build the index.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {nationalities.map(nat => {
                  const on = filters.selectedNats.includes(nat);
                  return (
                    <button
                      key={nat}
                      onClick={() => toggleNat(nat)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all',
                        on
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-700',
                      )}
                    >
                      {nat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sort section */}
          <div className="border-t border-slate-100 pt-4">
            <FLabel icon={ArrowUpDown}>Sort</FLabel>
            <select
              value={filters.sort}
              onChange={e => set('sort', e.target.value as LegacyFilterState['sort'])}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-primary-300"
            >
              <option value="newest">Newest first</option>
              <option value="name_az">Name A → Z</option>
              <option value="name_za">Name Z → A</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Active chips (when collapsed) ── */}
      {hasActive && !expanded && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2.5 bg-primary-50/30">
          {filters.selectedRanks.map(r => (
            <ActiveChip key={r} label={r} onRemove={() => toggleRank(r)} />
          ))}
          {filters.selectedNats.map(n => (
            <ActiveChip key={n} label={n} onRemove={() => toggleNat(n)} />
          ))}
          {filters.sort !== 'newest' && (
            <ActiveChip
              label={filters.sort === 'name_az' ? 'Name A → Z' : 'Name Z → A'}
              onRemove={() => set('sort', 'newest')}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
export default function LegacyPage() {
  const [pageData,      setPageData]      = useState<PageData | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [progress,      setProgress]      = useState<ImportProgress | null>(null);
  const [isDragging,    setIsDragging]    = useState(false);
  const [cursorStack,   setCursorStack]   = useState<Array<string | null>>([null]);
  const [currentPage,   setCurrentPage]   = useState(0);
  const [reindexState,  setReindexState]  = useState<ReindexState>('idle');
  const [reindexResult, setReindexResult] = useState<{ processed: number; updated: number } | null>(null);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [filters,       setFilters]       = useState<LegacyFilterState>(DEFAULT_FILTERS);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [natsLoading,   setNatsLoading]   = useState(false);

  const abortRef   = useRef(false);
  const dragCount  = useRef(0);
  const fileInput  = useRef<HTMLInputElement>(null);
  const debounceId = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track previously committed filter values to detect changes
  const prevFilters = useRef<LegacyFilterState>(DEFAULT_FILTERS);

  // ── Load nationality options from API ─────────────────────
  const loadOptions = useCallback(async () => {
    setNatsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken() ?? '';
      const res   = await fetch('/api/legacy-cv/options', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json  = await res.json() as { success: boolean; nationalities?: string[]; ranks?: string[] };
      if (json.success) setNationalities(json.nationalities ?? []);
    } catch {
      // non-critical — filters still work, just won't have chips
    } finally {
      setNatsLoading(false);
    }
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // ── Auto-reindex on first visit (backfills rankLower / nationalityLower) ──
  // Without these fields on existing records rank/nat filters return 0 results.
  // We do this once and remember it in localStorage so subsequent loads are instant.
  useEffect(() => {
    const REINDEX_KEY = 'legacyCv_reindexed_v1';
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(REINDEX_KEY)) return; // already done

    setReindexState('running');
    auth.currentUser?.getIdToken().then(token =>
      fetch('/api/legacy-cv/reindex', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then((json: { success: boolean; updated?: number; processed?: number }) => {
          if (json.success) {
            localStorage.setItem(REINDEX_KEY, '1');
            setReindexState('done');
            setReindexResult({ processed: json.processed ?? 0, updated: json.updated ?? 0 });
            // Reload nationality options now that reindex populated the meta doc
            loadOptions();
            // Re-fetch so rank/nat filters now return results immediately
            fetchPage(null, DEFAULT_FILTERS);
          } else {
            setReindexState('idle');
          }
        })
        .catch(() => setReindexState('idle')),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch page (server-side search + rank + nat) ───────────
  const fetchPage = useCallback(async (
    afterId: string | null,
    f: LegacyFilterState,
  ) => {
    setLoading(true);
    setFetchError(null);
    try {
      const token  = await auth.currentUser?.getIdToken() ?? '';
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT), sort: f.sort });
      if (afterId)                  params.set('afterId', afterId);
      if (f.search.trim())          params.set('search', f.search.trim());
      if (f.selectedRanks.length)   params.set('ranks', f.selectedRanks.join(','));
      if (f.selectedNats.length)    params.set('nats',  f.selectedNats.join(','));
      const res  = await fetch(`/api/legacy-cv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { success: boolean; data?: PageData; error?: string };
      if (json.success && json.data) {
        setPageData(json.data);
      } else if (!json.success) {
        setFetchError(json.error ?? 'Failed to load records');
      }
    } catch (err) {
      console.error('[legacy page] fetch error', err);
      setFetchError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchPage(null, DEFAULT_FILTERS); }, [fetchPage]);

  // ── React to filter changes (with name-search debounce) ───
  function handleFilterChange(next: LegacyFilterState) {
    setFilters(next);

    const prev = prevFilters.current;

    // If only search changed, debounce the fetch
    const searchChanged = next.search !== prev.search;
    const otherChanged  =
      next.sort          !== prev.sort          ||
      next.selectedRanks !== prev.selectedRanks ||
      next.selectedNats  !== prev.selectedNats;

    if (searchChanged && !otherChanged) {
      if (debounceId.current) clearTimeout(debounceId.current);
      debounceId.current = setTimeout(() => {
        prevFilters.current = next;
        setCursorStack([null]);
        setCurrentPage(0);
        fetchPage(null, next);
      }, 350);
    } else {
      // Chips / sort changed — fetch immediately
      if (debounceId.current) clearTimeout(debounceId.current);
      prevFilters.current = next;
      setCursorStack([null]);
      setCurrentPage(0);
      fetchPage(null, next);
    }
  }

  // ── Clear all filters ─────────────────────────────────────
  function clearFilters() {
    prevFilters.current = DEFAULT_FILTERS;
    setFilters(DEFAULT_FILTERS);
    setCursorStack([null]);
    setCurrentPage(0);
    fetchPage(null, DEFAULT_FILTERS);
  }

  // ── Chunked import ────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setProgress({ phase: 'error', totalRecords: 0, totalBatches: 0, batchDone: 0,
        recordsDone: 0, imported: 0, skipped: 0, fileName: file.name, startedAt: Date.now(),
        error: 'Only .json files are supported.' });
      return;
    }

    abortRef.current = false;

    setProgress({ phase: 'reading', totalRecords: 0, totalBatches: 0, batchDone: 0,
      recordsDone: 0, imported: 0, skipped: 0, fileName: file.name, startedAt: Date.now() });

    let records: Record<string, unknown>[];
    try {
      const text   = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const raw    = Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown[]>).records ?? [];
      records = raw.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object');
    } catch (err) {
      setProgress(p => p ? { ...p, phase: 'error',
        error: err instanceof Error ? err.message : 'Failed to parse JSON.' } : null);
      return;
    }

    if (records.length === 0) {
      setProgress(p => p ? { ...p, phase: 'error', error: 'No valid records found in file.' } : null);
      return;
    }

    const batches       = chunk(records, BATCH_SIZE);
    const token         = await auth.currentUser?.getIdToken() ?? '';
    let   totalImported = 0;
    let   totalSkipped  = 0;
    let   batchDone     = 0;
    let   recordsDone   = 0;

    setProgress(p => p ? {
      ...p, phase: 'importing', totalRecords: records.length, totalBatches: batches.length,
    } : null);

    for (let i = 0; i < batches.length; i += PARALLEL) {
      if (abortRef.current) break;

      const wave = batches.slice(i, i + PARALLEL);
      const results = await Promise.all(wave.map(async (batchRecords) => {
        try {
          const res  = await fetch('/api/legacy-cv', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ records: batchRecords }),
          });
          const json = await res.json() as { success: boolean; imported?: number; skipped?: number; error?: string };
          if (json.success) return { imported: json.imported ?? 0, skipped: json.skipped ?? 0, count: batchRecords.length };
          return { imported: 0, skipped: batchRecords.length, count: batchRecords.length, error: json.error ?? 'Server error' };
        } catch (err) {
          return { imported: 0, skipped: batchRecords.length, count: batchRecords.length,
            error: err instanceof Error ? err.message : 'Network error' };
        }
      }));

      for (const r of results) {
        totalImported += r.imported;
        totalSkipped  += r.skipped;
        batchDone     += 1;
        recordsDone   += r.count;
      }

      setProgress(p => p ? { ...p, batchDone, recordsDone, imported: totalImported, skipped: totalSkipped } : null);
    }

    const wasStopped = abortRef.current;
    setProgress(p => p ? { ...p, phase: wasStopped ? 'stopped' : 'done', imported: totalImported, skipped: totalSkipped } : null);
    setCursorStack([null]);
    setCurrentPage(0);
    fetchPage(null, filters);
  }

  // ── Reindex existing records ──────────────────────────────
  async function runReindex() {
    setReindexState('running');
    setReindexResult(null);
    try {
      const token = await auth.currentUser?.getIdToken() ?? '';
      const res   = await fetch('/api/legacy-cv/reindex', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { success: boolean; processed?: number; updated?: number; error?: string };
      if (json.success) {
        setReindexState('done');
        setReindexResult({ processed: json.processed ?? 0, updated: json.updated ?? 0 });
        // Reload nationality options now that the meta doc is updated
        loadOptions();
        // Refresh list so filters now work
        fetchPage(null, filters);
      } else {
        setReindexState('error');
      }
    } catch {
      setReindexState('error');
    }
  }

  // ── Drag handlers ─────────────────────────────────────────
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCount.current++; if (dragCount.current === 1) setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCount.current--; if (dragCount.current === 0) setIsDragging(false); };
  const onDragOver  = (e: React.DragEvent) => e.preventDefault();
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); dragCount.current = 0; setIsDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  // ── Pagination ────────────────────────────────────────────
  function goNext() {
    if (!pageData?.hasMore || !pageData.nextId) return;
    const newPage = currentPage + 1;
    setCursorStack(s => { const c = [...s]; c[newPage] = pageData.nextId; return c; });
    setCurrentPage(newPage);
    fetchPage(pageData.nextId, filters);
  }
  function goPrev() {
    if (currentPage === 0) return;
    const prev = currentPage - 1;
    setCurrentPage(prev);
    fetchPage(cursorStack[prev] ?? null, filters);
  }

  const total   = pageData?.total ?? 0;
  const records = pageData?.records ?? [];
  const showing = records.length;
  const from    = currentPage * PAGE_LIMIT + 1;
  const to      = currentPage * PAGE_LIMIT + showing;

  const hasActiveFilters =
    !!filters.search || filters.selectedRanks.length > 0 || filters.selectedNats.length > 0;

  const isImporting = progress?.phase === 'importing' || progress?.phase === 'reading' || progress?.phase === 'stopping';
  const pct = progress && progress.totalBatches > 0
    ? Math.round((progress.batchDone / progress.totalBatches) * 100)
    : 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Old CVs"
        subtitle="Legacy seafarer database — import and browse historical records"
      />

      <div className="flex-1 overflow-y-auto bg-surface-50 p-6 space-y-5">

        {/* ── Import zone ──────────────────────────────────── */}
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={cn(
            'relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden',
            isDragging
              ? 'border-primary-400 bg-primary-50/60 shadow-lg shadow-primary-100/50'
              : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/10',
          )}
        >
          {/* ── Idle / Error drop zone ── */}
          {(!progress || progress.phase === 'error') && (
            <div className="flex flex-col sm:flex-row items-center gap-4 p-5">
              <div className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors',
                isDragging ? 'bg-primary-100' : 'bg-slate-100',
              )}>
                <Upload className={cn('h-6 w-6', isDragging ? 'text-primary-600' : 'text-slate-400')} />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm font-semibold text-slate-700">
                  {isDragging ? 'Release to start import' : 'Drop a JSON file here, or click Browse'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sends {PARALLEL} batches in parallel — 9 500 records finishes in seconds
                </p>
                {progress?.error && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />{progress.error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Reindex button — fixes rank/nat filters on old imported records */}
                <button
                  onClick={runReindex}
                  disabled={reindexState === 'running'}
                  title="Backfill rank/nationality index fields on existing records so filters work correctly"
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                    reindexState === 'done'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : reindexState === 'error'
                        ? 'border-red-200 bg-red-50 text-red-600'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary-300 hover:text-primary-600',
                  )}
                >
                  {reindexState === 'running'
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reindexing…</>
                    : reindexState === 'done'
                      ? <><CheckCircle2 className="h-3.5 w-3.5" /> {reindexResult ? `${reindexResult.updated.toLocaleString()} updated` : 'Done'}</>
                      : reindexState === 'error'
                        ? <><XCircle className="h-3.5 w-3.5" /> Failed</>
                        : <><RefreshCw className="h-3.5 w-3.5" /> Fix Filters</>}
                </button>
                <button
                  onClick={() => fileInput.current?.click()}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                >
                  Browse File
                </button>
              </div>
            </div>
          )}

          {/* ── Reading phase ── */}
          {progress?.phase === 'reading' && (
            <div className="flex items-center gap-4 p-5">
              <Loader2 className="h-8 w-8 shrink-0 animate-spin text-primary-400" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Reading file…</p>
                <p className="text-xs text-slate-400 mt-0.5">{progress.fileName}</p>
              </div>
            </div>
          )}

          {/* ── Importing / Stopping phase ── */}
          {(progress?.phase === 'importing' || progress?.phase === 'stopping') && (
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileJson className={cn('h-5 w-5 shrink-0', progress.phase === 'stopping' ? 'text-amber-500' : 'text-primary-500')} />
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {progress.phase === 'stopping'
                        ? 'Stopping — finishing current batch…'
                        : `Importing — batch ${progress.batchDone} of ${progress.totalBatches}`}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">
                      {progress.fileName} · {progress.totalRecords.toLocaleString()} records
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                  <span className={cn('font-semibold', progress.phase === 'stopping' ? 'text-amber-500' : 'text-primary-600')}>{pct}%</span>
                  <span className="text-slate-300">|</span>
                  <ElapsedTimer startedAt={progress.startedAt} />
                  {progress.phase !== 'stopping' && (
                    <button
                      onClick={() => { abortRef.current = true; setProgress(p => p ? { ...p, phase: 'stopping' } : null); }}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
              <ProgressBar pct={pct} />
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Processed</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">
                    {(progress.recordsDone ?? 0).toLocaleString()}
                    <span className="text-[10px] text-slate-400 font-normal">/{progress.totalRecords.toLocaleString()}</span>
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Imported</p>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">{progress.imported.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Skipped</p>
                  <p className="text-lg font-bold text-amber-700 mt-0.5">{progress.skipped.toLocaleString()}</p>
                </div>
              </div>
              {progress.totalBatches <= 60 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {Array.from({ length: progress.totalBatches }).map((_, i) => (
                    <div key={i} className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      i < progress.batchDone ? 'bg-primary-500 w-4'
                        : i === progress.batchDone ? 'bg-primary-300 w-4 animate-pulse'
                        : 'bg-slate-200 w-2',
                    )} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Stopped phase ── */}
          {progress?.phase === 'stopped' && (
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50">
                  <XCircle className="h-6 w-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">Import stopped</p>
                  <p className="text-xs text-slate-400 mt-0.5">{progress.fileName}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-sm font-semibold text-slate-700">
                      {progress.batchDone} of {progress.totalBatches} batches completed
                      ({progress.recordsDone.toLocaleString()} records)
                    </span>
                    {progress.imported > 0 && (
                      <span className="text-sm font-medium text-emerald-600">
                        ✓ {progress.imported.toLocaleString()} saved
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => { setProgress(null); fileInput.current?.click(); }}
                    className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                  >Start Over</button>
                  <button
                    onClick={() => setProgress(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >Dismiss</button>
                </div>
              </div>
              <div className="mt-4"><ProgressBar pct={pct} /></div>
            </div>
          )}

          {/* ── Done phase ── */}
          {progress?.phase === 'done' && (
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">Import complete</p>
                  <p className="text-xs text-slate-400 mt-0.5">{progress.fileName}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-sm font-semibold text-emerald-700">
                      ✓ {progress.imported.toLocaleString()} new records added
                    </span>
                    {progress.skipped > 0 && (
                      <span className="text-sm font-medium text-amber-600">
                        ↷ {progress.skipped.toLocaleString()} duplicates skipped
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setProgress(null); fileInput.current?.click(); }}
                  className="shrink-0 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
                >Import More</button>
              </div>
              <div className="mt-4"><ProgressBar pct={100} /></div>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </div>

        {/* ── Reindex status banner ────────────────────────── */}
        {reindexState === 'running' && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
            <p className="text-sm text-blue-700 font-medium">
              Building filter index for {(pageData?.total ?? 9500).toLocaleString()} records — rank &amp; nationality filters will be ready in a moment…
            </p>
          </div>
        )}
        {reindexState === 'done' && reindexResult && reindexResult.updated > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">
              Filter index ready — {reindexResult.updated.toLocaleString()} records indexed. Rank &amp; nationality filters now work across all records.
            </p>
            <button onClick={() => setReindexResult(null)} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs">✕</button>
          </div>
        )}

        {/* ── Filter bar ────────────────────────────────────── */}
        <LegacyCvFilters
          filters={filters}
          onChange={handleFilterChange}
          totalCount={total}
          loading={loading}
          nationalities={nationalities}
          natsLoading={natsLoading}
        />

        {/* ── Fetch error banner ───────────────────────────── */}
        {fetchError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
            <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">Failed to load records</p>
              <p className="text-xs text-red-500 mt-0.5 break-all">{fetchError}</p>
              {fetchError.includes('index') && (
                <p className="text-xs text-red-600 font-medium mt-1">
                  Firestore index missing — check Vercel logs for a link to create the index, or click &quot;Fix Filters&quot; to rebuild index fields on existing records.
                </p>
              )}
            </div>
            <button onClick={clearFilters} className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800">
              Clear filters
            </button>
          </div>
        )}

        {/* ── Records list ─────────────────────────────────── */}
        {!loading && records.length === 0 && total === 0 && !hasActiveFilters ? (
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
        ) : !loading && records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm gap-2">
            <Search className="h-8 w-8 text-slate-200" />
            <p>No records match the current filters</p>
            <button
              onClick={clearFilters}
              className="mt-1 text-xs font-semibold text-primary-500 hover:text-primary-700 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid gap-3">
              {records.map((cv, idx) => (
                <motion.div
                  key={cv.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(idx * 0.015, 0.2) }}
                  className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm',
                    avatarColor(cv.name),
                  )}>
                    {initials(cv.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{cv.name || '(No name)'}</p>
                      {cv.nationality && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          <Globe className="h-3 w-3 shrink-0" />{cv.nationality}
                        </span>
                      )}
                      {cv.rank && (
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', rankColor(cv.rank))}>
                          {cv.rank}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {cv.email && <EmailLink email={cv.email} size="xs" truncate />}
                      {cv.phones.map((p, i) => <PhoneLink key={i} phone={p} size="xs" />)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}

        {/* ── Pagination ───────────────────────────────────── */}
        {(total > PAGE_LIMIT || currentPage > 0) && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-400">
              {showing > 0 ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} records` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={goPrev} disabled={currentPage === 0 || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="text-xs text-slate-400 font-medium px-1">Page {currentPage + 1}</span>
              <button onClick={goNext} disabled={!pageData?.hasMore || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
