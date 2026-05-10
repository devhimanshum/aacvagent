'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle2, AlertCircle, Copy, Anchor, Clock, Zap } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { auth } from '@/lib/firebase/config';
import { cn } from '@/lib/utils/helpers';

// ── Types ─────────────────────────────────────────────────────
type State = 'idle' | 'processing' | 'done' | 'duplicate' | 'error';

interface Result {
  name?:                 string;
  currentRank?:          string;
  totalSeaServiceMonths?: number;
  rankMatched?:          boolean;
  rankMatchScore?:       number;
  message?:              string;
}

// ── Helpers ───────────────────────────────────────────────────
function monthsLabel(m: number): string {
  if (!m) return '—';
  const y = Math.floor(m / 12), mo = m % 12;
  return [y ? `${y}yr` : '', mo ? `${mo}mo` : ''].filter(Boolean).join(' ');
}

function isSupported(file: File): boolean {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  return (
    t === 'application/pdf' ||
    t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    t === 'application/msword' ||
    n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.doc')
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function UploadPage() {
  const [state,     setState]     = useState<State>('idle');
  const [result,    setResult]    = useState<Result | null>(null);
  const [fileName,  setFileName]  = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dragCount  = useRef(0);
  const inputRef   = useRef<HTMLInputElement>(null);

  // ── Process a single file ──────────────────────────────────
  async function process(file: File) {
    if (!isSupported(file)) {
      setState('error');
      setResult({ message: 'Unsupported file. Please upload a PDF or DOCX.' });
      return;
    }

    setFileName(file.name);
    setState('processing');
    setResult(null);

    try {
      const token = await auth.currentUser?.getIdToken() ?? '';
      const fd    = new FormData();
      fd.append('file', file);

      const res  = await fetch('/api/cv/upload', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    fd,
      });
      const data = await res.json();

      if (data.status === 'success') {
        setState('done');
        setResult(data.candidate ?? {});
      } else if (data.status === 'duplicate') {
        setState('duplicate');
        setResult({ message: data.message });
      } else {
        setState('error');
        setResult({ message: data.message || 'Processing failed. Please try again.' });
      }
    } catch {
      setState('error');
      setResult({ message: 'Network error. Check your connection and try again.' });
    }
  }

  // ── Drag handlers ──────────────────────────────────────────
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
    if (file) process(file);
  }

  function reset() {
    setState('idle');
    setResult(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  // ── UI states ─────────────────────────────────────────────
  const isActive = state === 'processing';

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header title="Upload CV" subtitle="Drop a CV to process it instantly with AI" />

      <div className="flex-1 overflow-y-auto bg-surface-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">

            {/* ── IDLE ── */}
            {state === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22 }}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'relative flex cursor-pointer flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed px-10 py-20 text-center transition-all duration-200 select-none',
                  isDragging
                    ? 'border-primary-400 bg-primary-50/70 shadow-xl shadow-primary-100/50'
                    : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/20 hover:shadow-lg',
                )}
              >
                {/* Animated cloud icon */}
                <motion.div
                  animate={isDragging
                    ? { y: [-6, 6, -6], scale: 1.18 }
                    : { y: [0, -4, 0] }
                  }
                  transition={isDragging
                    ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
                  }
                  className={cn(
                    'flex h-24 w-24 items-center justify-center rounded-3xl transition-colors duration-200',
                    isDragging ? 'bg-primary-100' : 'bg-slate-100',
                  )}
                >
                  <UploadCloud className={cn(
                    'h-12 w-12 transition-colors duration-200',
                    isDragging ? 'text-primary-600' : 'text-slate-400',
                  )} />
                </motion.div>

                <div className="space-y-1.5">
                  <p className={cn(
                    'text-xl font-bold transition-colors',
                    isDragging ? 'text-primary-700' : 'text-slate-700',
                  )}>
                    {isDragging ? 'Release to upload' : 'Drop CV here'}
                  </p>
                  <p className="text-sm text-slate-400">
                    or{' '}
                    <span className="font-semibold text-primary-600 underline underline-offset-2">
                      click to browse
                    </span>
                  </p>
                  <p className="text-xs text-slate-300 pt-1">PDF · DOCX · DOC</p>
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) process(file);
                  }}
                />
              </motion.div>
            )}

            {/* ── PROCESSING ── */}
            {state === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-blue-100 bg-white px-10 py-20 text-center shadow-lg shadow-blue-50"
              >
                {/* Spinner rings */}
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                  <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary-500" style={{ animationDuration: '0.9s' }} />
                  <div className="absolute inset-2 animate-spin rounded-full border-4 border-transparent border-t-blue-300" style={{ animationDuration: '1.4s', animationDirection: 'reverse' }} />
                  <UploadCloud className="h-8 w-8 text-primary-400" />
                </div>

                <div className="space-y-2">
                  <p className="text-lg font-bold text-slate-800">Analysing CV…</p>
                  <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                    AI is extracting rank history, sea service &amp; candidate details
                  </p>
                  {fileName && (
                    <p className="text-[11px] text-slate-300 truncate max-w-xs font-mono">{fileName}</p>
                  )}
                </div>

                {/* Animated dots */}
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3].map(i => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      className="h-1.5 w-1.5 rounded-full bg-primary-400"
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── DONE ── */}
            {state === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, type: 'spring', stiffness: 280, damping: 24 }}
                className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-emerald-200 bg-white px-10 py-16 text-center shadow-lg shadow-emerald-50"
              >
                {/* Big check */}
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 border-2 border-emerald-200"
                >
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                </motion.div>

                <div className="space-y-1">
                  <p className="text-xl font-bold text-slate-800">Saved to Selected</p>
                  <p className="text-sm text-slate-400">CV processed and ready for review</p>
                </div>

                {/* Candidate info */}
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-5 py-4 space-y-3"
                  >
                    {result.name && (
                      <p className="text-base font-bold text-slate-800">{result.name}</p>
                    )}
                    <div className="flex flex-wrap justify-center gap-2">
                      {result.currentRank && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2.5 py-1">
                          <Anchor className="h-3 w-3" />{result.currentRank}
                        </span>
                      )}
                      {!!result.totalSeaServiceMonths && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-2.5 py-1">
                          <Clock className="h-3 w-3 text-slate-400" />{monthsLabel(result.totalSeaServiceMonths)}
                        </span>
                      )}
                      {result.rankMatched !== undefined && (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 border',
                          result.rankMatched
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200',
                        )}>
                          <Zap className="h-3 w-3" />
                          {result.rankMatched ? `${result.rankMatchScore ?? 0}% match` : 'No rank match'}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}

                <button
                  onClick={reset}
                  className="mt-2 rounded-2xl border-2 border-dashed border-slate-200 px-8 py-3 text-sm font-semibold text-slate-400 hover:border-primary-300 hover:text-primary-600 transition-all"
                >
                  Drop another CV
                </button>
              </motion.div>
            )}

            {/* ── DUPLICATE ── */}
            {state === 'duplicate' && (
              <motion.div
                key="duplicate"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-amber-200 bg-white px-10 py-16 text-center shadow-lg shadow-amber-50"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.05 }}
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-50 border-2 border-amber-200"
                >
                  <Copy className="h-11 w-11 text-amber-500" />
                </motion.div>

                <div className="space-y-1.5">
                  <p className="text-xl font-bold text-slate-800">Already in system</p>
                  {result?.message && (
                    <p className="text-sm text-amber-600 max-w-xs leading-relaxed">{result.message}</p>
                  )}
                </div>

                <button
                  onClick={reset}
                  className="mt-2 rounded-2xl border-2 border-dashed border-slate-200 px-8 py-3 text-sm font-semibold text-slate-400 hover:border-primary-300 hover:text-primary-600 transition-all"
                >
                  Drop another CV
                </button>
              </motion.div>
            )}

            {/* ── ERROR ── */}
            {state === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-red-200 bg-white px-10 py-16 text-center shadow-lg shadow-red-50"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.05 }}
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-red-50 border-2 border-red-200"
                >
                  <AlertCircle className="h-11 w-11 text-red-400" />
                </motion.div>

                <div className="space-y-1.5">
                  <p className="text-xl font-bold text-slate-800">Processing failed</p>
                  {result?.message && (
                    <p className="text-sm text-red-500 max-w-xs leading-relaxed">{result.message}</p>
                  )}
                </div>

                <button
                  onClick={reset}
                  className="mt-2 rounded-2xl border-2 border-dashed border-slate-200 px-8 py-3 text-sm font-semibold text-slate-400 hover:border-red-300 hover:text-red-500 transition-all"
                >
                  Try again
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
