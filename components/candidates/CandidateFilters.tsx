'use client';

import { useState } from 'react';
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp,
  Clock, Anchor, ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils/helpers';
import { MARITIME_RANKS, ranksMatch, rankMatchesQuery } from '@/lib/utils/ranks';
import type { Candidate } from '@/types';

/* ── Filter state ─────────────────────────────────────────── */
export interface FilterState {
  search:        string;
  selectedRanks: string[];   // multi-select, canonical names
  dateFrom:      string;
  dateTo:        string;
  minSeaService: number;
  rankMatch:     'all' | 'matched' | 'unmatched';
  duplicate:     'all' | 'yes' | 'no';
  sortBy:        'date' | 'name' | 'seaService' | 'rankScore';
  sortDir:       'asc' | 'desc';
}

export const DEFAULT_FILTERS: FilterState = {
  search: '', selectedRanks: [], dateFrom: '', dateTo: '',
  minSeaService: 0, rankMatch: 'all', duplicate: 'all',
  sortBy: 'date', sortDir: 'desc',
};

/* ── Apply filters ────────────────────────────────────────── */
export function applyFilters(candidates: Candidate[], f: FilterState): Candidate[] {
  let list = [...candidates];

  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    list = list.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.senderEmail?.toLowerCase().includes(q) ||
      rankMatchesQuery(c.currentRank ?? '', q),
    );
  }

  if (f.selectedRanks.length > 0) {
    list = list.filter(c =>
      f.selectedRanks.some(sel => ranksMatch(sel, c.currentRank ?? '')),
    );
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
  if (f.duplicate === 'yes')       list = list.filter(c =>  c.duplicate);
  if (f.duplicate === 'no')        list = list.filter(c => !c.duplicate);

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
  if (f.search)                                    n++;
  if (f.selectedRanks.length > 0)                  n++;
  if (f.minSeaService > 0)                         n++;
  if (f.rankMatch !== 'all')                       n++;
  if (f.sortBy !== 'date' || f.sortDir !== 'desc') n++;
  return n;
}

/* ── Chips ───────────────────────────────────────────────── */
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

/* ── Main component ──────────────────────────────────────── */
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

  function set<K extends keyof FilterState>(key: K, val: FilterState[K]) {
    onChange({ ...filters, [key]: val });
  }

  function toggleRank(rank: string) {
    const next = filters.selectedRanks.includes(rank)
      ? filters.selectedRanks.filter(r => r !== rank)
      : [...filters.selectedRanks, rank];
    set('selectedRanks', next);
  }

  const seaLabel = filters.minSeaService === 0
    ? 'Any'
    : `${Math.floor(filters.minSeaService / 12)}y ${filters.minSeaService % 12}m`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── Search + toggle row ── */}
      <div className="flex items-center gap-2 px-3 py-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
          <input
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            placeholder="Search name, email or rank…"
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
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {filteredCount === totalCount ? `${totalCount} total` : `${filteredCount} / ${totalCount}`}
          </span>
          {extra}
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-5">

          {/* Rank multi-select — flat list, all 28 ranks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <FLabel icon={Anchor}>
                Filter by Rank
                {filters.selectedRanks.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                    {filters.selectedRanks.length}
                  </span>
                )}
              </FLabel>
              {filters.selectedRanks.length > 0 && (
                <button
                  onClick={() => set('selectedRanks', [])}
                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* All 28 ranks as a simple wrap of chips */}
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

            <p className="mt-2 text-[10px] text-slate-400">
              Checks primary rank only. Synonyms auto-resolved — "2E" and "Second Engineer" are the same.
            </p>
          </div>

          {/* Sea service + Sort */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div>
              <FLabel icon={Clock}>Min Sea Service — {seaLabel}</FLabel>
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

            <div>
              <FLabel icon={ArrowUpDown}>Sort By</FLabel>
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
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors text-sm font-bold"
                  title={filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {filters.sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active chips (when collapsed) ── */}
      {hasActive && !expanded && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2.5 bg-primary-50/30">
          {filters.selectedRanks.map(r => (
            <ActiveChip key={r} label={r} onRemove={() => toggleRank(r)} />
          ))}
          {filters.minSeaService > 0 && (
            <ActiveChip label={`≥ ${seaLabel} sea service`} onRemove={() => set('minSeaService', 0)} />
          )}
          {filters.rankMatch !== 'all' && (
            <ActiveChip label={`Match: ${filters.rankMatch}`} onRemove={() => set('rankMatch', 'all')} />
          )}
          {(filters.sortBy !== 'date' || filters.sortDir !== 'desc') && (
            <ActiveChip label={`Sort: ${filters.sortBy} ${filters.sortDir}`} onRemove={() => onChange({ ...filters, sortBy: 'date', sortDir: 'desc' })} />
          )}
        </div>
      )}
    </div>
  );
}
