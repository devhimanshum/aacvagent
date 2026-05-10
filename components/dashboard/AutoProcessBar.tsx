'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronUp, Square, X,
} from 'lucide-react';
import { useProcessing, fmtSync } from '@/lib/contexts/processing-context';
import { cn } from '@/lib/utils/helpers';

// ── Thin progress bar ─────────────────────────────────────────
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-white/80"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Indeterminate shimmer bar (scanning) ──────────────────────
function ShimmerBar() {
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20">
      <motion.div
        className="absolute inset-y-0 w-1/3 rounded-full bg-white/60"
        animate={{ x: ['0%', '300%'] }}
        transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
export function AutoProcessBar() {
  const { phase, jobs, summary, error, lastSync, total, done, currentSubject, run, stop, dismiss } = useProcessing();
  const [expanded, setExpanded] = useState(false);

  const newAdded  = summary?.added ?? 0;

  // Auto-dismiss after 8s when done and nothing new was found
  useEffect(() => {
    if (phase === 'done' && newAdded === 0) {
      const id = setTimeout(() => dismiss(), 8000);
      return () => clearTimeout(id);
    }
  }, [phase, newAdded, dismiss]);

  // Don't render at all when idle (before first run)
  if (phase === 'idle') return null;

  const isActive  = phase === 'scanning' || phase === 'processing';
  const isDone    = phase === 'done';
  const isError   = phase === 'error';

  // Colour scheme per phase
  const gradients = {
    scanning:   'from-blue-600 to-indigo-600',
    processing: 'from-blue-700 to-indigo-700',
    done:       newAdded > 0 ? 'from-emerald-600 to-teal-600' : 'from-slate-600 to-slate-700',
    error:      'from-red-600 to-rose-600',
  }[phase];

  return (
    <AnimatePresence>
      <motion.div
        key="process-bar"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden shrink-0"
      >
        {/* ── Main strip ── */}
        <div className={cn('bg-gradient-to-r px-4 py-2.5', gradients)}>
          <div className="flex items-center gap-3">

            {/* Spinning / static icon */}
            <div className="shrink-0 flex items-center justify-center w-5">
              {phase === 'scanning' && (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw className="h-3.5 w-3.5 text-white/80" />
                </motion.div>
              )}
              {phase === 'processing' && (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}>
                  <Zap className="h-3.5 w-3.5 text-white/90" />
                </motion.div>
              )}
              {isDone  && <CheckCircle2 className="h-3.5 w-3.5 text-white/90" />}
              {isError && <AlertCircle  className="h-3.5 w-3.5 text-white/90" />}
            </div>

            {/* Label + progress */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                {/* Left: status text */}
                <p className="text-[12px] font-semibold text-white truncate leading-none">
                  {phase === 'scanning' && 'Scanning inbox for new CVs…'}
                  {phase === 'processing' && currentSubject && (
                    <span>
                      <span className="opacity-60">Analysing </span>
                      {currentSubject.length > 52
                        ? currentSubject.slice(0, 52) + '…'
                        : currentSubject}
                    </span>
                  )}
                  {phase === 'processing' && !currentSubject && `Processing CVs — ${done} of ${total}`}
                  {isDone  && newAdded > 0  && `${newAdded} new CV${newAdded !== 1 ? 's' : ''} added to review`}
                  {isDone  && newAdded === 0 && 'Inbox up to date — no new CVs found'}
                  {isError && 'Processing failed — check Outlook connection'}
                </p>

                {/* Right: counter + controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {phase === 'processing' && (
                    <span className="text-[11px] font-bold text-white/80 tabular-nums">
                      {done}/{total}
                    </span>
                  )}
                  {(isDone || isError) && lastSync && (
                    <span className="hidden sm:block text-[11px] text-white/50 font-medium">
                      {fmtSync(lastSync)}
                    </span>
                  )}

                  {/* ■ Stop (processing only) */}
                  {phase === 'processing' && (
                    <button
                      onClick={stop}
                      className="flex items-center gap-1 rounded-md bg-white/20 hover:bg-white/30 active:bg-white/40 px-2 py-1 text-[11px] font-bold text-white transition-colors"
                    >
                      <Square className="h-2.5 w-2.5 fill-white" />
                      Stop
                    </button>
                  )}

                  {/* Run Again / Retry */}
                  {(isDone || isError) && (
                    <button
                      onClick={run}
                      className="flex items-center gap-1 rounded-md bg-white/20 hover:bg-white/30 active:bg-white/40 px-2 py-1 text-[11px] font-bold text-white transition-colors"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      {isError ? 'Retry' : 'Run Again'}
                    </button>
                  )}

                  {/* Dismiss (✕) — always shown when done or error */}
                  {(isDone || isError) && (
                    <button
                      onClick={dismiss}
                      className="rounded-md bg-white/15 hover:bg-white/30 active:bg-white/40 p-1 text-white transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}

                  {/* Expand/collapse log (done + jobs exist) */}
                  {isDone && jobs.length > 0 && (
                    <button
                      onClick={() => setExpanded(e => !e)}
                      className="rounded-md bg-white/15 hover:bg-white/25 p-1 text-white transition-colors"
                      title={expanded ? 'Hide log' : 'Show log'}
                    >
                      {expanded
                        ? <ChevronUp   className="h-3.5 w-3.5" />
                        : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress / shimmer bar */}
              {phase === 'processing' && <Bar      value={done} max={total} />}
              {phase === 'scanning'   && <ShimmerBar />}
            </div>
          </div>
        </div>

        {/* ── Expandable log ── */}
        <AnimatePresence>
          {expanded && jobs.length > 0 && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="bg-white border-b border-slate-200 max-h-52 overflow-y-auto divide-y divide-slate-50">
                {jobs.map(j => (
                  <div key={j.email.id} className="flex items-center gap-3 px-4 py-2">
                    {j.status === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                    {j.status === 'skipped' && <CheckCircle2 className="h-3 w-3 text-amber-400 shrink-0" />}
                    {j.status === 'error'   && <XCircle      className="h-3 w-3 text-red-400 shrink-0" />}
                    {j.status === 'queued'  && <div className="h-3 w-3 rounded-full border-2 border-slate-200 shrink-0" />}
                    {j.status === 'running' && (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                        <RefreshCw className="h-3 w-3 text-blue-500 shrink-0" />
                      </motion.div>
                    )}
                    <p className="flex-1 min-w-0 text-[12px] text-slate-700 truncate">{j.email.subject}</p>
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0',
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

        {/* ── Error detail ── */}
        {isError && (
          <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center justify-between gap-4">
            <p className="text-[11px] text-red-600 flex-1">
              {error || 'Processing failed — check your Outlook and OpenAI configuration in Settings.'}
            </p>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[11px] font-semibold text-red-600 underline hover:no-underline"
            >
              Run diagnostics →
            </a>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
