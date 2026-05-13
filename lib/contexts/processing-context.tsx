'use client';

/**
 * ProcessingContext — global AI-process state that lives in the dashboard layout.
 *
 * Because it's in the layout (not a page), the processing loop survives tab
 * switches. The auto-run fires exactly once on layout mount via hasRunRef.
 *
 * Any component can call:
 *   const { phase, run, stop, ... } = useProcessing();
 */

import {
  createContext, useContext, useState, useRef,
  useCallback, useEffect, type ReactNode,
} from 'react';
import { apiClient } from '@/lib/utils/api-client';
import type { PreviewEmail } from '@/app/api/emails/preview/route';

// ── localStorage helpers ──────────────────────────────────────
const LS_KEY = 'shipivishta_last_sync';
export function saveLastSync() {
  try { localStorage.setItem(LS_KEY, new Date().toISOString()); } catch { /* noop */ }
}
export function loadLastSync(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}
export function fmtSync(iso: string | null): string {
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
export type Phase = 'idle' | 'scanning' | 'processing' | 'done' | 'error';

export interface JobRow {
  email:    PreviewEmail;
  status:   'queued' | 'running' | 'success' | 'skipped' | 'error';
  message?: string;
}

export interface ProcessingSummary {
  added:   number;
  skipped: number;
  errors:  number;
}

interface ProcessingContextValue {
  phase:    Phase;
  jobs:     JobRow[];
  summary:  ProcessingSummary | null;
  error:    string | null;
  lastSync: string | null;
  /** Total being processed, done count */
  total:    number;
  done:     number;
  /** Currently-processing email subject */
  currentSubject: string | null;
  run:     () => void;
  stop:    () => void;
  dismiss: () => void;
}

const Ctx = createContext<ProcessingContextValue | null>(null);

export function useProcessing() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProcessing must be used inside ProcessingProvider');
  return v;
}

// ── Provider ──────────────────────────────────────────────────
interface Props {
  children:    ReactNode;
  onComplete?: (added: number) => void;
}

export function ProcessingProvider({ children, onComplete }: Props) {
  const [phase,    setPhase]    = useState<Phase>('idle');
  const [jobs,     setJobs]     = useState<JobRow[]>([]);
  const [summary,  setSummary]  = useState<ProcessingSummary | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const abortRef  = useRef(false);
  const hasRunRef = useRef(false);

  // ── Derived ──
  const done           = jobs.filter(j => j.status !== 'queued' && j.status !== 'running').length;
  const total          = jobs.length;
  const currentSubject = jobs.find(j => j.status === 'running')?.email.subject ?? null;

  // ── Core run ──────────────────────────────────────────────
  const run = useCallback(async () => {
    abortRef.current = false;
    setPhase('scanning');
    setError(null);
    setJobs([]);
    setSummary(null);

    // 1. Scan
    let emails: PreviewEmail[];
    try {
      const res = await apiClient.get<{
        success: boolean;
        data:    { emails: PreviewEmail[]; pendingCount: number };
        error?:  string;
      }>('/api/emails/preview');
      if (!res.success) throw new Error((res as { error?: string }).error ?? 'Scan failed');
      emails = res.data.emails.filter(e => !e.isProcessed);
      saveLastSync();
      setLastSync(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not scan inbox');
      setPhase('error');
      return;
    }

    // 2. Nothing to do?
    if (emails.length === 0) {
      setSummary({ added: 0, skipped: 0, errors: 0 });
      setPhase('done');
      onComplete?.(0);
      return;
    }

    // 3. Process
    setJobs(emails.map(e => ({ email: e, status: 'queued' })));
    setPhase('processing');

    let added = 0, skipped = 0, errors = 0;

    for (let i = 0; i < emails.length; i++) {
      if (abortRef.current) break;

      setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'running' } : j));

      try {
        const res = await apiClient.post<{
          success: boolean;
          data?: { status: string; message?: string };
        }>('/api/emails/process', {
          emailId:          emails[i].id,
          internetMessageId: emails[i].internetMessageId,
        });

        const s = res.data?.status;
        const msg = res.data?.message;
        if      (s === 'success') { added++;   setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'success', message: msg } : j)); }
        else if (s === 'skipped') { skipped++; setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'skipped', message: msg } : j)); }
        else                      { errors++;  setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'error',   message: msg ?? 'Unknown error' } : j)); }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : 'Failed';
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'error', message: msg } : j));
      }
    }

    const result = { added, skipped, errors };
    setSummary(result);
    // Always notify so stats/candidates refresh — even when user stopped mid-run
    onComplete?.(added);
    // Only show the 'done' banner if we weren't aborted (stop() already set phase to 'idle')
    if (!abortRef.current) {
      setPhase('done');
    }
  }, [onComplete]);

  const stop = useCallback(() => {
    abortRef.current = true;
    setPhase('idle');   // immediately clear the bar — don't wait for in-flight request
  }, []);

  const dismiss = useCallback(() => {
    setPhase('idle');
  }, []);

  // ── Auto-run once on layout mount ──
  useEffect(() => {
    if (!hasRunRef.current) {
      hasRunRef.current = true;
      setLastSync(loadLastSync());
      run();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider value={{ phase, jobs, summary, error, lastSync, total, done, currentSubject, run, stop, dismiss }}>
      {children}
    </Ctx.Provider>
  );
}
