'use client';

import { useState, useMemo, useCallback } from 'react';
import { Users, Download, RotateCcw, Loader2, CheckSquare, Square, Mail } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { CandidateCard } from '@/components/candidates/CandidateCard';
import { CandidateFilters, DEFAULT_FILTERS, applyFilters } from '@/components/candidates/CandidateFilters';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { BulkMailDialog } from '@/components/email/BulkMailDialog';
import { useCandidates } from '@/hooks/useCandidates';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { FilterState } from '@/components/candidates/CandidateFilters';
import type { Candidate } from '@/types';

interface CandidatesPageProps {
  decision:       'selected' | 'unselected';
  title:          string;
  subtitle:       string;
  /** When true, hides the bulk email send button (used for Onboard section) */
  hideMailButton?: boolean;
}

// ── CSV export ────────────────────────────────────────────────
function exportCSV(candidates: Candidate[], filename: string) {
  const headers = [
    'Name', 'Email', 'Phone', 'Current Rank', 'Total Sea Service (months)',
    'Rank Match', 'Rank Match Score', 'Education', 'Duplicate',
    'Review Status', 'Review Note', 'Processed At',
  ];

  const rows = candidates.map(c => [
    c.name, c.email, c.phone, c.currentRank,
    c.totalSeaServiceMonths,
    c.rankMatched !== undefined ? (c.rankMatched ? 'Yes' : 'No') : '',
    c.rankMatchScore ?? '',
    c.education, c.duplicate ? 'Yes' : 'No',
    c.reviewStatus, c.reviewNote ?? '', c.processedAt,
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CandidatesPage({ decision, title, subtitle, hideMailButton }: CandidatesPageProps) {
  const { candidates, loading, refetch } = useCandidates(decision);
  const [filters,     setFilters]    = useState<FilterState>(DEFAULT_FILTERS);
  const [undoing,     setUndoing]    = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mailDialog,  setMailDialog]  = useState(false);

  const filtered = useMemo(() => applyFilters(candidates, filters), [candidates, filters]);

  const handleUndo = useCallback(async (candidateId: string) => {
    setUndoing(candidateId);
    try {
      await apiClient.put('/api/candidates/review', { candidateId });
      toast.success('Decision reversed — candidate moved back to Review');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Undo failed');
    } finally {
      setUndoing(null);
    }
  }, [refetch]);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => setSelectedIds(
    selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id))
  );
  const allSelected  = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;

  const handleExport = useCallback(() => {
    if (filtered.length === 0) {
      toast.error('No candidates to export');
      return;
    }
    exportCSV(filtered, `${decision}_candidates_${new Date().toISOString().slice(0,10)}.csv`);
    toast.success(`Exported ${filtered.length} candidates as CSV`);
  }, [filtered, decision]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={title} subtitle={subtitle} />

      <div className="flex-1 overflow-y-auto bg-surface-50">
        <div className="mx-auto max-w-7xl p-6 space-y-5">

          {/* ── Filters ── */}
          <CandidateFilters
            filters={filters}
            onChange={setFilters}
            totalCount={candidates.length}
            filteredCount={filtered.length}
            extra={
              <button
                onClick={handleExport}
                disabled={loading || candidates.length === 0}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-surface-100 hover:border-slate-300 transition-all shadow-card disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            }
          />

          {/* ── Selection toolbar ── */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 flex-wrap">
              <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                {allSelected ? <CheckSquare className="h-4 w-4 text-primary-500" /> : <Square className="h-4 w-4 text-slate-300" />}
                {allSelected ? 'Deselect All' : `Select All (${filtered.length})`}
              </button>
              {someSelected && (
                <>
                  <div className="w-px h-5 bg-slate-200" />
                  <span className="text-xs font-semibold text-primary-600 bg-primary-50 rounded-full px-2.5 py-1 border border-primary-100">
                    {selectedIds.size} selected
                  </span>
                  {!hideMailButton && (
                    <button
                      onClick={() => setMailDialog(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Send Email ({selectedIds.size})
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Content ── */}
          {loading ? (
            <div className="grid gap-4">
              {Array(6).fill(0).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid gap-4">
              {filtered.map((c, i) => (
                <div
                  key={c.id}
                  className={cn('relative group', selectedIds.has(c.id) && 'ring-2 ring-primary-300 rounded-2xl')}
                >
                  {/* Checkbox overlay */}
                  <button
                    onClick={() => toggleSelect(c.id)}
                    className="absolute top-3 left-3 z-10 rounded-lg p-0.5 text-slate-300 hover:text-primary-500 transition-colors bg-white/80 backdrop-blur-sm shadow-sm"
                  >
                    {selectedIds.has(c.id)
                      ? <CheckSquare className="h-4 w-4 text-primary-500" />
                      : <Square className="h-4 w-4" />}
                  </button>
                  <CandidateCard candidate={c} index={i} />
                  {/* Undo button overlay */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleUndo(c.id)}
                      disabled={undoing === c.id}
                      title={decision === 'selected' ? 'Move back to Selected (review queue)' : 'Move back to Selected'}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-card hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all disabled:opacity-60"
                    >
                      {undoing === c.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RotateCcw className="h-3 w-3" />}
                      {decision === 'selected' ? 'Back to Selected' : 'Undo'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: 'linear-gradient(135deg,#f0f6ff,#e8eef6)' }}>
                <Users className="h-7 w-7 text-primary-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">
                {filters.search
                  ? 'No matching candidates'
                  : decision === 'selected'
                    ? 'No onboarded candidates yet'
                    : 'No unselected candidates yet'}
              </p>
              {!filters.search && (
                <p className="text-xs text-slate-400 mt-1">
                  {decision === 'selected'
                    ? 'Review selected candidates and click Onboard to move them here'
                    : 'Rejected candidates will appear here after review'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

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
