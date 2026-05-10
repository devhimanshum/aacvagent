'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserCheck, UserX, RefreshCw, Mail,
  Anchor, Clock, BookOpen, AlertCircle,
  CheckCircle2, ClipboardList, ChevronDown, ChevronUp,
  CheckSquare, Square, Zap, MessageSquare,
} from 'lucide-react';
import { EmailLink, PhoneLink } from '@/components/ui/ContactLink';
import { CVPreviewButton } from '@/components/ui/CVPreviewButton';
import { BulkMailDialog } from '@/components/email/BulkMailDialog';
import { CandidateFilters, DEFAULT_FILTERS, applyFilters } from '@/components/candidates/CandidateFilters';
import { aggregateRanks, monthsLabel } from '@/components/candidates/CandidateCard';
import { apiClient } from '@/lib/utils/api-client';
import { cn, formatDateTime } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { FilterState } from '@/components/candidates/CandidateFilters';
import type { Candidate, RankEntry, RankConfig, RankRequirement } from '@/types';

// ── helpers ───────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
}
const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',     'from-indigo-500 to-blue-600',
];
const getColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

// ── Rank experience summary (aggregated) ─────────────────────
function RankExperienceSummary({ history, rankConfig }: { history: RankEntry[]; rankConfig: RankRequirement[] }) {
  const agg = aggregateRanks(history);

  // Sort by config order if available, else by totalMonths desc
  const sorted = rankConfig.length > 0
    ? agg.sort((a, b) => {
        const oa = rankConfig.findIndex(r => r.rank.toLowerCase() === a.rank.toLowerCase());
        const ob = rankConfig.findIndex(r => r.rank.toLowerCase() === b.rank.toLowerCase());
        const orderA = oa >= 0 ? oa : 999;
        const orderB = ob >= 0 ? ob : 999;
        if (a.isPresentRole && !b.isPresentRole) return -1;
        if (!a.isPresentRole && b.isPresentRole)  return  1;
        if (orderA !== orderB) return orderA - orderB;
        return b.totalMonths - a.totalMonths;
      })
    : agg;

  const maxMonths = Math.max(...sorted.map(r => r.totalMonths), 1);

  if (!sorted.length) return <p className="text-xs text-slate-400 italic">No rank history extracted</p>;

  return (
    <div className="space-y-2">
      {sorted.map(r => (
        <div key={r.rank} className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 w-36 shrink-0">
            {r.isPresentRole && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
            <span className={cn('text-xs truncate', r.isPresentRole ? 'font-bold text-emerald-800' : 'font-medium text-slate-700')}>
              {r.rank}
            </span>
          </div>
          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full', r.isPresentRole ? 'bg-emerald-400' : 'bg-primary-400')}
              style={{ width: `${Math.min(100, (r.totalMonths / maxMonths) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-500 w-14 text-right shrink-0">{monthsLabel(r.totalMonths)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Raw rank history timeline ─────────────────────────────────
function RankTimeline({ history }: { history: RankEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? history : history.slice(0, 3);

  if (!history.length) return <p className="text-xs text-slate-400 italic">No rank history extracted</p>;

  return (
    <div className="space-y-1.5">
      {visible.map((entry, i) => (
        <div key={i} className={cn(
          'flex items-start gap-3 rounded-xl px-3 py-2 border text-xs',
          entry.isPresentRole ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50/60',
        )}>
          <div className={cn('mt-1 h-2 w-2 rounded-full shrink-0', entry.isPresentRole ? 'bg-emerald-500' : 'bg-slate-300')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('font-bold', entry.isPresentRole ? 'text-emerald-800' : 'text-slate-800')}>
                {entry.rank || 'Unknown Rank'}
              </span>
              {entry.isPresentRole && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">Current</span>
              )}
              {entry.durationMonths ? (
                <span className="flex items-center gap-1 text-slate-400 ml-auto shrink-0">
                  <Clock className="h-3 w-3" />{monthsLabel(entry.durationMonths)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {entry.vessel  && <span className="flex items-center gap-1 text-slate-500"><Anchor className="h-3 w-3 text-slate-300" />{entry.vessel}</span>}
              {entry.company && <span className="text-slate-400">{entry.company}</span>}
              {(entry.from || entry.to) && <span className="text-slate-400">{entry.from}{entry.from && entry.to ? ' – ' : ''}{entry.to}</span>}
            </div>
          </div>
        </div>
      ))}
      {history.length > 3 && (
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 mt-1">
          {expanded ? <><ChevronUp className="h-3.5 w-3.5" />Show less</> : <><ChevronDown className="h-3.5 w-3.5" />Show {history.length - 3} more</>}
        </button>
      )}
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────
function CandidateCard({
  candidate, selected, onToggleSelect, onDecision, deciding, rankConfig,
}: {
  candidate: Candidate;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDecision: (id: string, d: 'selected' | 'unselected', note?: string) => void;
  deciding: boolean;
  rankConfig: RankRequirement[];
}) {
  const [detailOpen,  setDetailOpen]  = useState(false);
  const [noteOpen,    setNoteOpen]    = useState(false);
  const [note,        setNote]        = useState('');
  const [pendingDecision, setPending] = useState<'selected' | 'unselected' | null>(null);

  function handleDecisionClick(d: 'selected' | 'unselected') {
    setPending(d);
    setNoteOpen(true);
  }

  function confirmDecision() {
    if (!pendingDecision) return;
    onDecision(candidate.id, pendingDecision, note.trim() || undefined);
    setNoteOpen(false);
    setNote('');
    setPending(null);
  }

  function cancelDecision() {
    setNoteOpen(false);
    setNote('');
    setPending(null);
  }

  const hasRankMatch = candidate.rankMatched !== undefined;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22 }}
      className={cn(
        'rounded-2xl border bg-white shadow-sm overflow-hidden transition-all',
        selected ? 'border-primary-300 ring-1 ring-primary-200' : 'border-slate-200',
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Checkbox */}
        <button onClick={() => onToggleSelect(candidate.id)} className="mt-1 shrink-0 text-slate-300 hover:text-primary-500 transition-colors">
          {selected ? <CheckSquare className="h-5 w-5 text-primary-500" /> : <Square className="h-5 w-5" />}
        </button>

        {/* Avatar */}
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white text-sm font-bold shadow-sm', getColor(candidate.name))}>
          {getInitials(candidate.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">{candidate.name}</h3>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {candidate.currentRank && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2.5 py-0.5">
                    <Anchor className="h-3 w-3" />{candidate.currentRank}
                  </span>
                )}
                {hasRankMatch && (
                  <span className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border',
                    candidate.rankMatched
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200',
                  )}>
                    <Zap className="h-2.5 w-2.5" />
                    {candidate.rankMatched ? `Rank match ${candidate.rankMatchScore ?? 0}%` : 'No rank match'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {candidate.duplicate && (
                <span className="shrink-0 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                  Duplicate
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
            {candidate.email && <EmailLink email={candidate.email} size="sm" truncate />}
            {candidate.phone && <PhoneLink phone={candidate.phone} size="sm" />}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 mt-1">
            {candidate.totalSeaServiceMonths > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                <Clock className="h-3 w-3 text-slate-400" />
                Sea service: <strong>{monthsLabel(candidate.totalSeaServiceMonths)}</strong>
              </span>
            )}
            <span className="text-xs text-slate-400">Processed {formatDateTime(candidate.processedAt)}</span>
          </div>
        </div>
      </div>

      {/* ── Summary ── */}
      {candidate.summary && (
        <div className="mx-5 mb-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-600 leading-relaxed italic">"{candidate.summary}"</p>
        </div>
      )}

      {/* ── Education ── */}
      {candidate.education && candidate.education !== 'Not specified' && (
        <div className="mx-5 mb-3 flex items-start gap-2">
          <BookOpen className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">{candidate.education}</p>
        </div>
      )}

      {/* ── Per-rank experience summary ── */}
      {(candidate.rankHistory?.length ?? 0) > 0 && (
        <div className="mx-5 mb-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5">
            <Anchor className="h-3 w-3" /> Experience by Rank
          </p>
          <RankExperienceSummary history={candidate.rankHistory ?? []} rankConfig={rankConfig} />
        </div>
      )}

      {/* ── Raw rank history toggle ── */}
      <div className="border-t border-slate-100">
        <button
          onClick={() => setDetailOpen(o => !o)}
          className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
            Full History
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {candidate.rankHistory?.length ?? 0} entries
            </span>
          </span>
          {detailOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        <AnimatePresence>
          {detailOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
              <div className="px-5 pb-4 pt-1">
                <RankTimeline history={candidate.rankHistory ?? []} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Note field (shown when decision is pending) ── */}
      <AnimatePresence>
        {noteOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-slate-100">
            <div className="px-5 py-3 space-y-2 bg-slate-50">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <MessageSquare className="h-3.5 w-3.5" />
                {pendingDecision === 'selected' ? 'Reason for onboarding' : 'Reason for rejection'} (optional)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note about this candidate…"
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-primary-300 resize-none"
              />
              <div className="flex items-center gap-2 justify-end">
                <button onClick={cancelDecision} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirmDecision}
                  disabled={deciding}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-60',
                    pendingDecision === 'selected'
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-maritime-600 hover:bg-maritime-700',
                  )}
                >
                  {pendingDecision === 'selected'
                    ? <><UserCheck className="h-3.5 w-3.5" />Confirm Onboard</>
                    : <><UserX className="h-3.5 w-3.5" />Confirm Reject</>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer: CV + action buttons ── */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        {candidate.cvAttachmentId && candidate.emailId ? (
          <CVPreviewButton emailId={candidate.emailId} attachmentId={candidate.cvAttachmentId} fileName={candidate.cvFileName || 'CV'} />
        ) : <div />}

        {!noteOpen && (
          <div className="flex items-center gap-2">
            <button
              disabled={deciding}
              onClick={() => handleDecisionClick('unselected')}
              className="flex items-center gap-1.5 rounded-xl border border-maritime-200 bg-maritime-50 px-4 py-2 text-sm font-semibold text-maritime-600 transition-all hover:bg-maritime-500 hover:text-white hover:border-maritime-500 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserX className="h-4 w-4" /> Reject
            </button>
            <button
              disabled={deciding}
              onClick={() => handleDecisionClick('selected')}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-500 hover:text-white hover:border-emerald-500 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserCheck className="h-4 w-4" /> Onboard
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="h-5 w-5 rounded bg-slate-100 shrink-0" />
        <div className="h-12 w-12 rounded-xl bg-slate-200 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
          <div className="h-3 w-28 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>
      <div className="h-14 w-full rounded-xl bg-slate-100 animate-pulse" />
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────
export function CandidateReviewBoard() {
  const [candidates,   setCandidates]   = useState<Candidate[]>([]);
  const [rankConfig,   setRankConfig]   = useState<RankRequirement[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [deciding,     setDeciding]     = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [bulkLoading,  setBulkLoading]  = useState(false);
  const [mailDialog,   setMailDialog]   = useState(false);
  const [filters,      setFilters]      = useState<FilterState>(DEFAULT_FILTERS);

  const filtered = useMemo(() => applyFilters(candidates, filters), [candidates, filters]);

  // Load rank config once (for ordered display)
  useEffect(() => {
    apiClient.get<{ success: boolean; data: RankConfig | null }>('/api/config')
      .then(res => {
        const reqs = res.data?.requirements ?? [];
        setRankConfig(reqs.filter(r => r.enabled).sort((a, b) => a.order - b.order));
      })
      .catch(() => {/* use empty config — no ordering */});
  }, []);

  const fetchCandidates = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const res = await apiClient.get<{ success: boolean; data: Candidate[] }>('/api/candidates/review');
      setCandidates(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  async function handleDecision(candidateId: string, decision: 'selected' | 'unselected', note?: string) {
    setDeciding(candidateId);
    try {
      await apiClient.post('/api/candidates/review', { candidateId, decision, reviewNote: note });
      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(candidateId); return n; });
      toast.success(decision === 'selected' ? '✅ Candidate moved to Onboard!' : '❌ Candidate rejected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setDeciding(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  }

  async function handleBulkDecision(decision: 'selected' | 'unselected') {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        await apiClient.post('/api/candidates/review', { candidateId: id, decision });
        setCandidates(prev => prev.filter(c => c.id !== id));
        ok++;
      } catch { fail++; }
    }
    setSelectedIds(new Set());
    setBulkLoading(false);
    if (ok > 0) toast.success(`${ok} candidate${ok > 1 ? 's' : ''} ${decision === 'selected' ? 'moved to Onboard' : 'rejected'}`);
    if (fail > 0) toast.error(`${fail} failed`);
  }

  const allSelected  = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
            <UserCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Selected Candidates</h2>
            <p className="text-xs text-slate-500">
              {loading ? 'Loading…' : `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} awaiting your decision`}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchCandidates(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Filters ── */}
      {!loading && candidates.length > 0 && (
        <CandidateFilters
          filters={filters}
          onChange={setFilters}
          totalCount={candidates.length}
          filteredCount={filtered.length}
        />
      )}

      {/* ── Bulk action toolbar ── */}
      <AnimatePresence>
        {!loading && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 flex-wrap"
          >
            {/* Select all toggle */}
            <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              {allSelected
                ? <CheckSquare className="h-4 w-4 text-primary-500" />
                : <Square className="h-4 w-4 text-slate-300" />}
              {allSelected ? 'Deselect All' : `Select All (${filtered.length})`}
            </button>

            {/* Divider */}
            {someSelected && <div className="w-px h-5 bg-slate-200" />}

            {/* Bulk actions */}
            {someSelected && (
              <>
                <span className="text-xs font-semibold text-primary-600 bg-primary-50 rounded-full px-2.5 py-1 border border-primary-100">
                  {selectedIds.size} selected
                </span>
                <button
                  disabled={bulkLoading}
                  onClick={() => handleBulkDecision('selected')}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-60"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Onboard All ({selectedIds.size})
                </button>
                <button
                  disabled={bulkLoading}
                  onClick={() => handleBulkDecision('unselected')}
                  className="flex items-center gap-1.5 rounded-xl bg-maritime-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-maritime-600 transition-colors disabled:opacity-60"
                >
                  <UserX className="h-3.5 w-3.5" />
                  Reject All ({selectedIds.size})
                </button>
                <button
                  onClick={() => setMailDialog(true)}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Send Email ({selectedIds.size})
                </button>
              </>
            )}

            {/* Rank match indicator */}
            {!someSelected && filtered.some(c => c.rankMatched !== undefined) && (
              <span className="ml-auto text-xs text-slate-400">
                {filtered.filter(c => c.rankMatched).length} rank-matched
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-sm font-medium text-slate-600">Failed to load candidates</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button onClick={() => fetchCandidates()} className="text-xs text-primary-600 hover:underline font-medium">Try again</button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-700">All caught up!</p>
            <p className="text-sm text-slate-400 mt-1">No candidates selected yet. Use AI Process to scan and process your inbox.</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
            <ClipboardList className="h-8 w-8 text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-600">No matching candidates</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters to see results.</p>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-4">
            {filtered.map(c => (
              <CandidateCard
                key={c.id}
                candidate={c}
                selected={selectedIds.has(c.id)}
                onToggleSelect={toggleSelect}
                onDecision={handleDecision}
                deciding={deciding === c.id}
                rankConfig={rankConfig}
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {mailDialog && (
        <BulkMailDialog
          candidates={filtered.filter(c => selectedIds.has(c.id)).map(c => ({
            id: c.id, name: c.name, email: c.email, currentRank: c.currentRank,
          }))}
          onClose={() => setMailDialog(false)}
        />
      )}
    </div>
  );
}
