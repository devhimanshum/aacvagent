'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileText, X, CheckCircle2, AlertCircle,
  Clock, Anchor, Zap, ChevronRight, FolderOpen, Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { auth } from '@/lib/firebase/config';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────
type FileStatus = 'queued' | 'processing' | 'done' | 'duplicate' | 'error';

interface CandidateResult {
  name:                  string;
  currentRank:           string;
  email:                 string;
  totalSeaServiceMonths: number;
  rankMatched?:          boolean;
  rankMatchScore?:       number;
}

interface FileEntry {
  id:       string;
  file:     File;
  status:   FileStatus;
  result?:  CandidateResult;
  message?: string;
}

// ── Helpers ───────────────────────────────────────────────────
function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

// ── Sub-components ────────────────────────────────────────────
function FileTypePill({ file }: { file: File }) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  return (
    <div className={cn(
      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[10px] font-black tracking-wide text-white shadow-sm',
      isPdf ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-blue-500 to-blue-600',
    )}>
      {isPdf ? 'PDF' : 'DOC'}
    </div>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  if (status === 'queued') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
      Queued
    </span>
  );
  if (status === 'processing') return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
      Analysing…
    </span>
  );
  if (status === 'done') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
      <CheckCircle2 className="h-3 w-3" /> Done
    </span>
  );
  if (status === 'duplicate') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">
      Duplicate
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[11px] font-semibold text-red-600">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  );
}

function FileCard({ entry, onRemove }: { entry: FileEntry; onRemove: (id: string) => void }) {
  const canRemove = entry.status === 'queued' || entry.status === 'done'
    || entry.status === 'error' || entry.status === 'duplicate';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-2xl border bg-white px-4 py-3.5 transition-shadow',
        entry.status === 'processing' && 'border-blue-200 shadow-md shadow-blue-50',
        entry.status === 'done'       && 'border-emerald-200',
        entry.status === 'duplicate'  && 'border-amber-200',
        entry.status === 'error'      && 'border-red-200',
        entry.status === 'queued'     && 'border-slate-200',
      )}
    >
      <div className="flex items-start gap-3">
        {/* File type pill */}
        <FileTypePill file={entry.file} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Top row: name + size + badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate leading-tight" title={entry.file.name}>
                {entry.file.name}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{fmtSize(entry.file.size)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={entry.status} />
              {canRemove && (
                <button
                  onClick={() => onRemove(entry.id)}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Processing shimmer bar */}
          {entry.status === 'processing' && (
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 animate-[shimmer_1.5s_ease-in-out_infinite]"
                style={{ backgroundSize: '200% 100%' }}
              />
            </div>
          )}

          {/* Done: candidate result */}
          {entry.status === 'done' && entry.result && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-bold text-slate-800">{entry.result.name}</span>
              {entry.result.currentRank && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2 py-0.5">
                  <Anchor className="h-2.5 w-2.5" />{entry.result.currentRank}
                </span>
              )}
              {entry.result.totalSeaServiceMonths > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock className="h-3 w-3 text-slate-400" />{monthsLabel(entry.result.totalSeaServiceMonths)}
                </span>
              )}
              {entry.result.rankMatched !== undefined && (
                <span className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border',
                  entry.result.rankMatched
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200',
                )}>
                  <Zap className="h-2.5 w-2.5" />
                  {entry.result.rankMatched ? `${entry.result.rankMatchScore ?? 0}%` : 'No match'}
                </span>
              )}
            </div>
          )}

          {/* Duplicate / error message */}
          {(entry.status === 'duplicate' || entry.status === 'error') && entry.message && (
            <p className={cn(
              'mt-1.5 text-[11px] leading-relaxed',
              entry.status === 'duplicate' ? 'text-amber-600' : 'text-red-500',
            )}>
              {entry.message}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function UploadPage() {
  const [files,      setFiles]      = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCount   = useRef(0);
  const busy        = useRef(false);
  const filesRef    = useRef<FileEntry[]>([]);
  const inputRef    = useRef<HTMLInputElement>(null);

  // Keep filesRef in sync with state
  const updateFiles = useCallback((updater: (prev: FileEntry[]) => FileEntry[]) => {
    setFiles(prev => {
      const next = updater(prev);
      filesRef.current = next;
      return next;
    });
  }, []);

  // ── Process one file via API ───────────────────────────────
  const processNext = useCallback(async () => {
    if (busy.current) return;
    const next = filesRef.current.find(f => f.status === 'queued');
    if (!next) return;

    busy.current = true;
    updateFiles(prev => prev.map(f => f.id === next.id ? { ...f, status: 'processing' } : f));

    try {
      const token = await auth.currentUser?.getIdToken() ?? '';
      const fd    = new FormData();
      fd.append('file', next.file);

      const res  = await fetch('/api/cv/upload', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    fd,
      });
      const data = await res.json();

      if (data.status === 'success') {
        updateFiles(prev => prev.map(f =>
          f.id === next.id ? { ...f, status: 'done', result: data.candidate } : f
        ));
        toast.success(`✅ ${data.candidate?.name ?? 'Candidate'} added to Selected`);
      } else if (data.status === 'duplicate') {
        updateFiles(prev => prev.map(f =>
          f.id === next.id ? { ...f, status: 'duplicate', message: data.message } : f
        ));
      } else {
        updateFiles(prev => prev.map(f =>
          f.id === next.id ? { ...f, status: 'error', message: data.message || 'Processing failed' } : f
        ));
      }
    } catch (err) {
      updateFiles(prev => prev.map(f =>
        f.id === next.id ? { ...f, status: 'error', message: 'Network error — check your connection' } : f
      ));
    } finally {
      busy.current = false;
      // Move to next queued file
      setTimeout(processNext, 300);
    }
  }, [updateFiles]);

  // ── Accept dropped or selected files ──────────────────────
  const addFiles = useCallback((incoming: File[]) => {
    const valid   = incoming.filter(isSupported);
    const invalid = incoming.filter(f => !isSupported(f));

    if (invalid.length) {
      toast.error(`${invalid.length} file${invalid.length > 1 ? 's' : ''} skipped — PDF or DOCX only`);
    }
    if (!valid.length) return;

    const entries: FileEntry[] = valid.map(f => ({
      id:     `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file:   f,
      status: 'queued',
    }));

    updateFiles(prev => {
      const next = [...prev, ...entries];
      filesRef.current = next;
      return next;
    });

    // Start processing after state settles
    setTimeout(processNext, 80);
  }, [updateFiles, processNext]);

  // ── Drag handlers ──────────────────────────────────────────
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current++;
    if (dragCount.current === 1) setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current--;
    if (dragCount.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  };

  // ── Remove file from list ──────────────────────────────────
  const removeFile = useCallback((id: string) => {
    updateFiles(prev => prev.filter(f => f.id !== id));
  }, [updateFiles]);

  const clearAll = useCallback(() => {
    updateFiles(() => []);
  }, [updateFiles]);

  // ── Stats ──────────────────────────────────────────────────
  const total      = files.length;
  const done       = files.filter(f => f.status === 'done').length;
  const duplicates = files.filter(f => f.status === 'duplicate').length;
  const errors     = files.filter(f => f.status === 'error').length;
  const queued     = files.filter(f => f.status === 'queued').length;
  const processing = files.filter(f => f.status === 'processing').length;
  const isActive   = queued > 0 || processing > 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Upload CVs"
        subtitle="Drag & drop CV files to process them with AI"
        actions={
          total > 0 ? (
            <div className="flex items-center gap-2">
              {!isActive && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All
                </button>
              )}
              <Link
                href="/dashboard/review"
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#059669 0%,#10b981 100%)' }}
              >
                View Selected <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto bg-surface-50">
        <div className="mx-auto max-w-3xl p-6 space-y-5">

          {/* ── Stats bar (shows once files are added) ── */}
          <AnimatePresence>
            {total > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid grid-cols-4 gap-3"
              >
                {[
                  { label: 'Total',      value: total,      color: 'text-slate-800',   bg: 'bg-white border-slate-200' },
                  { label: 'Done',       value: done,       color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                  { label: 'Duplicates', value: duplicates, color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
                  { label: 'Errors',     value: errors,     color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
                ].map(s => (
                  <div key={s.label} className={cn('rounded-2xl border px-4 py-3 text-center', s.bg)}>
                    <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Drop zone ── */}
          <motion.div
            animate={isDragging ? { scale: 1.01 } : { scale: 1 }}
            transition={{ duration: 0.15 }}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 select-none',
              isDragging
                ? 'border-primary-400 bg-primary-50/60 shadow-lg shadow-primary-100'
                : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/30',
            )}
          >
            {/* Animated upload icon */}
            <motion.div
              animate={isDragging ? { y: [-4, 4, -4], scale: 1.15 } : { y: 0, scale: 1 }}
              transition={isDragging ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-3xl transition-colors',
                isDragging ? 'bg-primary-100' : 'bg-slate-100',
              )}
            >
              <UploadCloud className={cn(
                'h-10 w-10 transition-colors',
                isDragging ? 'text-primary-600' : 'text-slate-400',
              )} />
            </motion.div>

            <div>
              <p className={cn('text-base font-bold transition-colors', isDragging ? 'text-primary-700' : 'text-slate-700')}>
                {isDragging ? 'Release to upload' : 'Drop CV files here'}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                or{' '}
                <span className="font-semibold text-primary-600 underline underline-offset-2">
                  browse files
                </span>
                {' '}— PDF & DOCX supported
              </p>
              <p className="mt-2 text-[11px] text-slate-300">
                Drop multiple files at once · Each CV is analysed by AI automatically
              </p>
            </div>

            {/* Supported formats */}
            <div className="flex items-center gap-2">
              {['PDF', 'DOCX', 'DOC'].map(fmt => (
                <span key={fmt} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-400">
                  {fmt}
                </span>
              ))}
            </div>

            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={e => {
                const picked = Array.from(e.target.files ?? []);
                addFiles(picked);
                e.target.value = ''; // reset so same file can be re-added
              }}
            />
          </motion.div>

          {/* ── Processing tip ── */}
          {isActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
              </span>
              <p className="text-xs text-blue-700 font-medium">
                Processing {queued + processing} file{queued + processing !== 1 ? 's' : ''} — CVs are analysed one at a time for accuracy. Keep this page open.
              </p>
            </motion.div>
          )}

          {/* ── File queue ── */}
          <AnimatePresence mode="popLayout">
            {files.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-2.5"
              >
                {/* Section header */}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Queue ({total})
                  </p>
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> Add more
                  </button>
                </div>

                {/* File cards */}
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {files.map(entry => (
                      <FileCard
                        key={entry.id}
                        entry={entry}
                        onRemove={removeFile}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {/* Done summary */}
                {!isActive && done > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-emerald-800">
                          {done} CV{done > 1 ? 's' : ''} processed successfully
                        </p>
                        <p className="text-xs text-emerald-600 mt-0.5">
                          Added to Selected — ready for your review
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/dashboard/review"
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors shrink-0"
                    >
                      Review now <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Empty state ── */}
          {files.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
                <FileText className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No files yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Drop CVs into the zone above to start processing
              </p>
            </div>
          )}

        </div>
      </div>

      {/* ── Global shimmer keyframe ── */}
      <style jsx global>{`
        @keyframes shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </div>
  );
}
