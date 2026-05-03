'use client';

/**
 * AutoProcessBar
 *
 * Inline (no modal) AI-processing strip that:
 *  1. Fires automatically on mount — scans the inbox and processes all new CVs
 *  2. Shows a progress bar with live per-email counts
 *  3. Shows "Last sync" time and a "Run Again" button when idle/done
 *  4. Can be manually re-triggered via the exposed ref / trigger prop
 */

import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Mail, ChevronDown, ChevronUp,
} from 'lucide-react';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import type { PreviewEmail } from '@/app/api/emails/preview/route';

// ── localStorage helpers ──────────────────────────────────────
const LS_KEY = 'shipivishta_last_sync';

function saveLastSync() {
  try { localStorage.setItem(LS_KEY, new Date().toISOString()); } catch { /* noop */ }
}
function loadLastSync(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}
function fmtSync(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Types ─────────────────────────────────────────────────────
type Phase = 'idle' | 'scanning' | 'processing' | 'done' | 'error';

interface JobRow {
  email:    PreviewEmail;
  status:   'queued' | 'running' | 'success' | 'skipped' | 'error';
  message?: string;
}

interface PreviewData {
  emails:         PreviewEmail[];
  pendingCount:   number;
  processedCount: number;
  totalCount:     number;
}

export interface AutoProcessHandle {
  run: () => void;
}

interface Props {
  onComplete?: (added: number) => void;
}

// ── Progress bar ──────────────────────────────────────────────
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/20">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-white"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
export const AutoProcessBar = forwardRef<AutoProcessHandle, Props>(
  function AutoProcessBar({ onComplete }, ref) {
    const [phase,    setPhase]    = useState<Phase>('idle');
    const [jobs,     setJobs]     = useState<JobRow[]>([]);
    const [error,    setError]    = useState<string | null>(null);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [summary,  setSummary]  = useState<{ added: number; skipped: number; errors: number } | null>(null);
    const [expanded, setExpanded] = useState(false);
    const abortRef = useRef(false);
    const hasRunRef = useRef(false);

    // ── Derived ──
    const done    = jobs.filter(j => j.status !== 'queued' && j.status !== 'running').length;
    const running = jobs.find(j => j.status === 'running');
    const pct     = jobs.length > 0 ? Math.round((done / jobs.length) * 100) : 0;

    // ── Core run function ──────────────────────────────────────
    const run = useCallback(async () => {
      abortRef.current = false;
      setPhase('scanning');
      setError(null);
      setJobs([]);
      setSummary(null);

      // 1. Scan inbox
      let preview: PreviewData;
      try {
        const res = await apiClient.get<{ success: boolean; data: PreviewData; error?: string }>(
          '/api/emails/preview',
        );
        if (!res.success) throw new Error((res as { error?: string }).error ?? 'Scan failed');
        preview = res.data;
        saveLastSync();
        setLastSync(new Date().toISOString());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not scan inbox');
        setPhase('error');
        return;
      }

      // 2. If nothing to process, go straight to done
      const toProcess = preview.emails.filter(e => !e.isProcessed);
      if (toProcess.length === 0) {
        setSummary({ added: 0, skipped: 0, errors: 0 });
        setPhase('done');
        onComplete?.(0);
        return;
      }

      // 3. Process each email one by one
      const initialJobs: JobRow[] = toProcess.map(e => ({ email: e, status: 'queued' }));
      setJobs(initialJobs);
      setPhase('processing');

      let added = 0, skipped = 0, errors = 0;

      for (let i = 0; i < toProcess.length; i++) {
        if (abortRef.current) break;

        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'running' } : j));

        try {
          const res = await apiClient.post<{
            success: boolean;
            data?: { status: string; message?: string };
          }>('/api/emails/process', { emailId: toProcess[i].id });

          const s = res.data?.status;
          if      (s === 'success') { added++;   setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'success', message: res.data?.message } : j)); }
          else if (s === 'skipped') { skipped++; setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'skipped', message: res.data?.message } : j)); }
          else                      { errors++;  setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'error', message: res.data?.message ?? 'Unknown error' } : j)); }
        } catch (err) {
          errors++;
          const msg = err instanceof Error ? err.message : 'Failed';
          setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'error', message: msg } : j));
        }
      }

      setSummary({ added, skipped, errors });
      setPhase('done');
      onComplete?.(added);
    }, [onComplete]);

    // ── Expose run() to parent via ref ──
    useImperativeHandle(ref, () => ({ run }), [run]);

    // ── Auto-run on first mount ──
    useEffect(() => {
      if (!hasRunRef.current) {
        hasRunRef.current = true;
        setLastSync(loadLastSync());
        run();
      }
    }, [run]);

    // ── Idle state (nothing shown — just last sync in parent) ──
    if (phase === 'idle') return null;

    return (
      <AnimatePresence>
        <motion.div
          key="autobar"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'rounded-2xl overflow-hidden shadow-sm',
            phase === 'error' ? 'border border-red-200' : 'border border-transparent',
          )}
        >
          {/* ── Main strip ── */}
          <div
            className={cn(
              'px-4 py-3 flex items-center gap-3',
              phase === 'scanning'   && 'bg-gradient-to-r from-blue-600 to-indigo-600',
              phase === 'processing' && 'bg-gradient-to-r from-blue-700 to-indigo-700',
              phase === 'done'       && (summary?.added ?? 0) > 0
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                : phase === 'done'
                  ? 'bg-gradient-to-r from-slate-600 to-slate-700'
                  : '',
              phase === 'error'      && 'bg-gradient-to-r from-red-600 to-rose-600',
            )}
          >
            {/* Icon / spinner */}
            <div className="shrink-0">
              {phase === 'scanning' && (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw className="h-4 w-4 text-white/80" />
                </motion.div>
              )}
              {phase === 'processing' && (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
                  <Zap className="h-4 w-4 text-white/80" />
                </motion.div>
              )}
              {phase === 'done' && <CheckCircle2 className="h-4 w-4 text-white/90" />}
              {phase === 'error'  && <AlertCircle  className="h-4 w-4 text-white/90" />}
            </div>

            {/* Label + progress */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-white truncate">
                  {phase === 'scanning'   && 'Scanning inbox for new CVs…'}
                  {phase === 'processing' && (
                    running
                      ? `AI Analysis · ${running.email.subject.length > 45 ? running.email.subject.slice(0, 45) + '…' : running.email.subject}`
                      : `Processing CVs — ${done} of ${jobs.length} complete`
                  )}
                  {phase === 'done' && (
                    summary?.added ?? 0) > 0
                      ? `${summary!.added} new CV${summary!.added !== 1 ? 's' : ''} added to review`
                      : phase === 'done'
                        ? 'Inbox up to date — no new CVs'
                        : ''
                  }
                  {phase === 'error' && 'Could not complete — check your Outlook connection'}
                </p>

                <div className="flex items-center gap-2 shrink-0">
                  {/* % counter */}
                  {phase === 'processing' && (
                    <span className="text-xs font-bold text-white/90 tabular-nums">
                      {done}/{jobs.length}
                    </span>
                  )}
                  {/* Last sync */}
                  {(phase === 'done' || phase === 'error') && lastSync && (
                    <span className="text-[11px] text-white/60 font-medium hidden sm:block">
                      Synced {fmtSync(lastSync)}
                    </span>
                  )}
                  {/* Run Again */}
                  {(phase === 'done' || phase === 'error') && (
                    <button
                      onClick={run}
                      className="flex items-center gap-1 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {phase === 'error' ? 'Retry' : 'Run Again'}
                    </button>
                  )}
                  {/* Stop */}
                  {phase === 'processing' && (
                    <button
                      onClick={() => { abortRef.current = true; }}
                      className="flex items-center gap-1 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
                    >
                      Stop
                    </button>
                  )}
                  {/* Expand toggle (done with jobs) */}
                  {phase === 'done' && jobs.length > 0 && (
                    <button
                      onClick={() => setExpanded(e => !e)}
                      className="rounded-lg bg-white/15 hover:bg-white/25 p-1 text-white transition-colors"
                      title={expanded ? 'Hide log' : 'Show log'}
                    >
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar (processing only) */}
              {phase === 'processing' && <Bar value={done} max={jobs.length} />}
              {/* Scanning pulse */}
              {phase === 'scanning' && (
                <motion.div
                  className="h-1.5 rounded-full bg-white/20 overflow-hidden"
                  initial={false}
                >
                  <motion.div
                    className="h-full w-1/3 rounded-full bg-white/60"
                    animate={{ x: ['0%', '300%'] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.div>
              )}
            </div>
          </div>

          {/* ── Expandable job log ── */}
          <AnimatePresence>
            {expanded && jobs.length > 0 && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden border-t border-slate-100 bg-white"
              >
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
                  {jobs.map(j => (
                    <div key={j.email.id} className="flex items-center gap-3 px-4 py-2.5">
                      {j.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      {j.status === 'skipped' && <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                      {j.status === 'error'   && <XCircle      className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                      {j.status === 'queued'  && <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 shrink-0" />}
                      {j.status === 'running' && (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <RefreshCw className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        </motion.div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-700 truncate">{j.email.subject}</p>
                        {j.message && <p className="text-[11px] text-slate-400 truncate">{j.message}</p>}
                      </div>
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0',
                        j.status === 'success' && 'text-emerald-700 bg-emerald-50 border-emerald-100',
                        j.status === 'skipped' && 'text-amber-600 bg-amber-50 border-amber-100',
                        j.status === 'error'   && 'text-red-600 bg-red-50 border-red-100',
                        j.status === 'queued'  && 'text-slate-400 bg-slate-50 border-slate-100',
                        j.status === 'running' && 'text-blue-600 bg-blue-50 border-blue-100',
                      )}>
                        {j.status === 'success' ? 'Added'
                          : j.status === 'skipped' ? 'Skipped'
                          : j.status === 'error'   ? 'Error'
                          : j.status === 'running' ? 'Analysing…'
                          : 'Queued'}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error detail */}
          {phase === 'error' && error && (
            <div className="px-4 py-3 bg-red-50 border-t border-red-100">
              <p className="text-xs text-red-600 flex items-start gap-1.5">
                <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {error}
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }
);
