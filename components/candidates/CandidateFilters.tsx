'use client';

import { useState } from 'react';
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp,
  Calendar, Clock, Anchor, Zap, AlertCircle, ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils/helpers';
import type { Candidate } from '@/types';

/* ── Maritime rank categories ──────────────────────────────── */
export const RANK_CATEGORIES: Record<string, { label: string; color: string; ranks: string[] }> = {
  deck: {
    label: 'Deck Officers',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    ranks: [
      'master', 'captain', 'chief officer', 'chief mate', 'c/o',
      'second officer', '2nd officer', '2/o',
      'third officer', '3rd officer', '3/o',
      'deck officer', 'deck cadet', 'navigating cadet',
    ],
  },
  engine: {
    label: 'Engine Officers',
    color: 'text-orange-700 bg-orange-50 border-orange-200',
    ranks: [
      'chief engineer', 'c/e',
      'second engineer', '2nd engineer', '2/e',
      'third engineer', '3rd engineer', '3/e',
      'fourth engineer', '4th engineer', '4/e',
      'engine officer', 'engine cadet', 'junior engineer',
    ],
  },
  electrical: {
    label: 'Electrical / ETO',
    color: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    ranks: ['eto', 'electrical officer', 'electro technical officer', 'electrician'],
  },
  ratings_deck: {
    label: 'Deck Ratings',
    color: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    ranks: ['bosun', 'boatswain', 'able seaman', 'ab', 'ordinary seaman', 'os', 'deck fitter', 'pumpman'],
  },
  ratings_engine: {
    label: 'Engine Ratings',
    color: 'text-red-700 bg-red-50 border-red-200',
    ranks: ['motorman', 'oiler', 'wiper', 'fitter', 'engine fitter', 'mechanic'],
  },
  catering: {
    label: 'Catering',
    color: 'text-pink-700 bg-pink-50 border-pink-200',
    ranks: ['chief cook', 'cook', 'steward', 'chief steward', 'messman'],
  },
};

export function rankCategory(rank: string): string | null {
  if (!rank) return null;
  const r = rank.toLowerCase();
  for (const [key, cat] of Object.entries(RANK_CATEGORIES)) {
    if (cat.ranks.some(k => r.includes(k) || k.includes(r))) return key;
  }
  return null;
}

/* ── Filter state ─────────────────────────────────────────── */
export interface FilterState {
  search:        string;
  rankCategory:  string;
  dateFrom:      string;
  dateTo:        string;
  minSeaService: number;
  rankMatch:     'all' | 'matched' | 'unmatched';
  duplicate:     'all' | 'yes' | 'no';
  sortBy:        'date' | 'name' | 'seaService' | 'rankScore';
  sortDir:       'asc' | 'desc';
}

export const DEFAULT_FILTERS: FilterState = {
  search: '', rankCategory: '', dateFrom: '', dateTo: '',
  minSeaService: 0, rankMatch: 'all', duplicate: 'all',
  sortBy: 'date', sortDir: 'desc',
};

/* ── Apply filters ────────────────────────────────────────── */
export function applyFilters(candidates: Candidate[], f: FilterState): Candidate[] {
  let list = [...candidates];

  if (f.search.trim()) {
    const q = f.search.toLowerCase();
    list = list.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.currentRank?.toLowerCase().includes(q) ||
      c.education?.toLowerCase().includes(q) ||
      c.senderEmail?.toLowerCase().includes(q) ||
      c.rankHistory?.some(r => r.rank?.toLowerCase().includes(q))
    );
  }

  if (f.rankCategory) {
    list = list.filter(c => rankCategory(c.currentRank ?? '') === f.rankCategory);
  }

  if (f.dateFrom) {
    const from = new Date(f.dateFrom).getTime();
    list = list.filter(c => new Date(c.processedAt ?? c.createdAt).getTime() >= from);
  }
  if (f.dateTo) {
    const to = new Date(f.dateTo).getTime() + 86_400_000;
    list = list.filter(c => new Date(c.processedAt ?? c.createdAt).getTime() <= to);
  }

  if (f.minSeaService > 0) {
    list = list.filter(c => (c.totalSeaServiceMonths ?? 0) >= f.minSeaService);
  }

  if (f.rankMatch === 'matched')   list = list.filter(c => c.rankMatched === true);
  if (f.rankMatch === 'unmatched') list = list.filter(c => c.rankMatched === false);

  if (f.duplicate === 'yes') list = list.filter(c =>  c.duplicate);
  if (f.duplicate === 'no')  list = list.filter(c => !c.duplicate);

  list.sort((a, b) => {
    let diff = 0;
    if (f.sortBy === 'date')       diff = new Date(b.processedAt ?? b.createdAt).getTime() - new Date(a.processedAt ?? a.createdAt).getTime();
    if (f.sortBy === 'name')       diff = (a.name ?? '').localeCompare(b.name ?? '');
    if (f.sortBy === 'seaService') diff = (b.totalSeaServiceMonths ?? 0) - (a.totalSeaServiceMonths ?? 0);
    if (f.sortBy === 'rankScore')  diff = (b.rankMatchScore ?? 0) - (a.rankMatchScore ?? 0);
    return f.sortDir === 'asc' ? -diff : diff;
  });

  return list;
}

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.search)            n++;
  if (f.rankCategory)      n++;
  if (f.dateFrom)          n++;
  if (f.dateTo)            n++;
  if (f.minSeaService > 0) n++;
  if (f.rankMatch !== 'all')            n++;
  if (f.duplicate !== 'all')            n++;
  if (f.sortBy !== 'date' || f.sortDir !== 'desc') n++;
  return n;
}

/* ── Active chip ─────────────────────────────────────────── */
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 border border-primary-200 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700 whitespace-nowrap">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-primary-900 transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* ── Label ───────────────────────────────────────────────── */
function FilterLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
      <Icon className="h-3 w-3" />{children}
    </label>
  );
}

/* ══════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════ */
interface Props {
  filters:       FilterState;
  onChange:      (f: FilterState) => void;
  totalCount:    number;
  filteredCount: number;
  extra?:        React.ReactNode;
}

export function CandidateFilters({ filters, onChange, totalCount, filteredCount, extra }: Props) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = activeFilterCount(filters);
  const hasActive   = activeCount > 0;

  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }
  function reset() { onChange(DEFAULT_FILTERS); }

  const seaLabel = filters.minSeaService === 0
    ? 'Any'
    : `${Math.floor(filters.minSeaService / 12)}y ${filters.minSeaService % 12}m`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── Search + toggle row ── */}
      <div className="flex items-center gap-2 px-3 py-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
          <input
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            placeholder="Search name, email, rank…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-300 focus:bg-white transition-all"
          />
          {filters.search && (
            <button onClick={() => set('search', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className={cn(
            'flex items-center gap-1.5 rounded-xl border px-3 h-9 text-sm font-semibold transition-all whitespace-nowrap',
            hasActive
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasActive && (
            <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold px-1">
              {activeCount}
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {/* Reset */}
        {hasActive && (
          <button
            onClick={reset}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 h-9 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <X className="h-3 w-3" /> Reset
          </button>
        )}

        {/* Count + extra */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {filteredCount === totalCount ? `${totalCount} total` : `${filteredCount} / ${totalCount}`}
          </span>
          {extra}
        </div>
      </div>

      {/* ── Expanded filter panel ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-4">

          {/* Row 1: Rank category */}
          <div>
            <FilterLabel icon={Anchor}>Rank Category</FilterLabel>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => set('rankCategory', '')}
                className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all',
                  !filters.rankCategory
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300')}
              >
                All
              </button>
              {Object.entries(RANK_CATEGORIES).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => set('rankCategory', filters.rankCategory === key ? '' : key)}
                  className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all',
                    filters.rankCategory === key ? cat.color : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300')}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: 3-column grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

            {/* Date range */}
            <div>
              <FilterLabel icon={Calendar}>Date Processed</FilterLabel>
              <div className="flex items-center gap-2">
                <input
                  type="date" value={filters.dateFrom}
                  onChange={e => set('dateFrom', e.target.value)}
                  className="flex-1 min-w-0 h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-primary-300"
                />
                <span className="text-xs text-slate-400 shrink-0">–</span>
                <input
                  type="date" value={filters.dateTo}
                  onChange={e => set('dateTo', e.target.value)}
                  className="flex-1 min-w-0 h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-primary-300"
                />
              </div>
            </div>

            {/* Min sea service */}
            <div>
              <FilterLabel icon={Clock}>Min Sea Service — {seaLabel}</FilterLabel>
              <input
                type="range" min={0} max={240} step={6}
                value={filters.minSeaService}
                onChange={e => set('minSeaService', Number(e.target.value))}
                className="w-full accent-primary-600 mt-1"
              />
              <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
                <span>None</span><span>5yr</span><span>10yr</span><span>20yr</span>
              </div>
            </div>

            {/* Sort */}
            <div>
              <FilterLabel icon={ArrowUpDown}>Sort By</FilterLabel>
              <div className="flex gap-2">
                <select
                  value={filters.sortBy}
                  onChange={e => set('sortBy', e.target.value as FilterState['sortBy'])}
                  className="flex-1 h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:border-primary-300"
                >
                  <option value="date">Date Processed</option>
                  <option value="name">Name A–Z</option>
                  <option value="seaService">Sea Service</option>
                  <option value="rankScore">Rank Match %</option>
                </select>
                <button
                  onClick={() => set('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc')}
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors text-xs font-bold"
                  title={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {filters.sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>

          {/* Row 3: Rank match + Duplicate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Rank match */}
            <div>
              <FilterLabel icon={Zap}>Rank Match</FilterLabel>
              <div className="flex gap-1.5">
                {(['all', 'matched', 'unmatched'] as const).map(v => (
                  <button key={v} onClick={() => set('rankMatch', v)}
                    className={cn('flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-all',
                      filters.rankMatch === v
                        ? v === 'matched'   ? 'bg-emerald-500 text-white border-emerald-500'
                          : v === 'unmatched' ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-slate-800 text-white border-slate-800'
                        : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                    )}
                  >
                    {v === 'all' ? 'All' : v === 'matched' ? '✓ Matched' : '✗ No match'}
                  </button>
                ))}
              </div>
            </div>

            {/* Duplicate */}
            <div>
              <FilterLabel icon={AlertCircle}>Duplicates</FilterLabel>
              <div className="flex gap-1.5">
                {(['all', 'no', 'yes'] as const).map(v => (
                  <button key={v} onClick={() => set('duplicate', v)}
                    className={cn('flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-all',
                      filters.duplicate === v
                        ? v === 'yes' ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-slate-800 text-white border-slate-800'
                        : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                    )}
                  >
                    {v === 'all' ? 'All' : v === 'yes' ? 'Dups only' : 'No dups'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active filter chips (collapsed state) ── */}
      {hasActive && !expanded && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2.5 bg-primary-50/30">
          {filters.rankCategory && (
            <ActiveChip label={RANK_CATEGORIES[filters.rankCategory]?.label ?? filters.rankCategory} onRemove={() => set('rankCategory', '')} />
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <ActiveChip label={`${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`} onRemove={() => onChange({ ...filters, dateFrom: '', dateTo: '' })} />
          )}
          {filters.minSeaService > 0 && (
            <ActiveChip label={`≥ ${seaLabel} sea service`} onRemove={() => set('minSeaService', 0)} />
          )}
          {filters.rankMatch !== 'all' && (
            <ActiveChip label={filters.rankMatch === 'matched' ? 'Rank matched' : 'No rank match'} onRemove={() => set('rankMatch', 'all')} />
          )}
          {filters.duplicate !== 'all' && (
            <ActiveChip label={filters.duplicate === 'yes' ? 'Dups only' : 'No dups'} onRemove={() => set('duplicate', 'all')} />
          )}
          {(filters.sortBy !== 'date' || filters.sortDir !== 'desc') && (
            <ActiveChip label={`Sort: ${filters.sortBy} ${filters.sortDir}`} onRemove={() => onChange({ ...filters, sortBy: 'date', sortDir: 'desc' })} />
          )}
        </div>
      )}
    </div>
  );
}
