'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, CheckCircle2, AlertCircle, Copy, Anchor, Clock,
  Zap, X, FileText, FileSpreadsheet, File, Loader2, Plus,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { auth } from '@/lib/firebase/config';
import { cn } from '@/lib/utils/helpers';

// ── Types ─────────────────────────────────────────────────────
type FileStatus = 'queued' | 'processing' | 'done' | 'duplicate' | 'error';

interface FileItem {
  id:       string;
  file:     File;
  status:   FileStatus;
  name?:    string;
  rank?:    string;
  service?: number;
  score?:   number;
  message?: string;
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
    t === 'application/vnd.ms-excel' ||
    t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.doc') ||
    n.endsWith('.xls') || n.endsWith('.xlsx')
  );
}

function fileIcon(file: File) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.xls') || n.endsWith('.xlsx'))
    return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
  if (n.endsWith('.pdf'))
    return <FileText className="h-4 w-4 text-red-400" />;
  if (n.endsWith('.docx') || n.endsWith('.doc'))
    return <FileText className="h-4 w-4 text-blue-400" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

// ── Main page ─────────────────────────────────────────────────
export default function UploadPage() {
  const [items,      setItems]      = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const processingRef = useRef(false);
  const dragCount     = useRef(0);
  const inputRef      = useRef<HTMLInputElement>(null);

  // ── Add files to queue ──────────────────────────────────────
  const enqueue = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const valid   = arr.filter(isSupported);
    const invalid = arr.filter(f => !isSupported(f));

    const newItems: FileItem[] = valid.map(f => ({ id: uid(), file: f, status: 'queued' }));
    if (invalid.length) {
      invalid.forEach(f => {
        newItems.push({ id: uid(), file: f, status: 'error', message: 'Unsupported type — use PDF, DOCX, DOC, XLS or XLSX' });
      });
    }

    setItems(prev => [...prev, ...newItems]);

    // kick off processing after state settles
    setTimeout(() => processQueue(), 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sequential processor ────────────────────────────────────
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // grab first queued item from current state
      let target: FileItem | undefined;
      setItems(prev => {
        target = prev.find(i => i.status === 'queued');
        return prev;
      });
      // Need to read outside setter — use a ref trick via a temp var
      await new Promise<void>(res => {
        setItems(prev => {
          target = prev.find(i => i.status === 'queued');
          res();
          return prev;
        });
      });

      if (!target) break;
      const item = target;

      // mark as processing
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

      try {
        const token = await auth.currentUser?.getIdToken() ?? '';
        const fd    = new FormData();
        fd.append('file', item.file);

        const res  = await fetch('/api/cv/upload', {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}` },
          body:    fd,
        });
        const data = await res.json();

        if (data.status === 'success') {
          setItems(prev => prev.map(i => i.id === item.id ? {
            ...i, status: 'done',
            name: data.candidate?.name,
            rank: data.candidate?.currentRank,
            service: data.candidate?.totalSeaServiceMonths,
            score: data.candidate?.rankMatchScore,
          } : i));
        } else if (data.status === 'duplicate') {
          setItems(prev => prev.map(i => i.id === item.id ? {
            ...i, status: 'duplicate', message: data.message,
          } : i));
        } else {
          setItems(prev => prev.map(i => i.id === item.id ? {
            ...i, status: 'error', message: data.message || 'Processing failed',
          } : i));
        }
      } catch {
        setItems(prev => prev.map(i => i.id === item.id ? {
          ...i, status: 'error', message: 'Network error',
        } : i));
      }
    }

    processingRef.current = false;
  }, []);

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
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCount.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length) enqueue(e.dataTransfer.files);
  }

  const removeItem = (id: string) =>
    setItems(prev => prev.filter(i => i.id !== id));

  const clearDone = () =>
    setItems(prev => prev.filter(i => i.status === 'queued' || i.status === 'processing'));

  const hasItems   = items.length > 0;
  const doneCount  = items.filter(i => i.status === 'done').length;
  const dupCount   = items.filter(i => i.status === 'duplicate').length;
  const errCount   = items.filter(i => i.status === 'error').length;
  const busyCount  = items.filter(i => i.status === 'queued' || i.status === 'processing').length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header title="Upload CV" subtitle="Drop one or multiple CVs to process them with AI" />

      <div className="flex-1 overflow-y-auto bg-surface-50 p-6">
        <div className="mx-auto max-w-2xl space-y-5">

          {/* ── Drop zone ── */}
          <div
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 select-none',
              isDragging
                ? 'border-primary-400 bg-primary-50/70 shadow-xl shadow-primary-100/50'
                : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/20 hover:shadow-lg',
            )}
          >
            <motion.div
              animate={isDragging ? { y: [-6, 6, -6], scale: 1.18 } : { y: [0, -4, 0] }}
              transition={isDragging
                ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-3xl transition-colors duration-200',
                isDragging ? 'bg-primary-100' : 'bg-slate-100',
              )}
            >
              <UploadCloud className={cn('h-10 w-10 transition-colors duration-200', isDragging ? 'text-primary-600' : 'text-slate-400')} />
            </motion.div>

            <div className="space-y-1">
              <p className={cn('text-lg font-bold transition-colors', isDragging ? 'text-primary-700' : 'text-slate-700')}>
                {isDragging ? 'Release to upload' : hasItems ? 'Drop more CVs' : 'Drop CVs here'}
              </p>
              <p className="text-sm text-slate-400">
                or{' '}
                <span className="font-semibold text-primary-600 underline underline-offset-2">click to browse</span>
                {' '}— multiple files supported
              </p>
              <p className="text-xs text-slate-300 pt-1">PDF · DOCX · DOC · XLS · XLSX</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xls,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={e => { if (e.target.files?.length) { enqueue(e.target.files); e.target.value = ''; } }}
            />
          </div>

          {/* ── Summary bar ── */}
          {hasItems && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-slate-600">{items.length} file{items.length !== 1 ? 's' : ''}</span>
              {doneCount  > 0 && <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">✓ {doneCount} saved</span>}
              {dupCount   > 0 && <span className="text-xs font-semibold text-amber-600  bg-amber-50  border border-amber-200  rounded-full px-2.5 py-0.5">↷ {dupCount} duplicate</span>}
              {errCount   > 0 && <span className="text-xs font-semibold text-red-600    bg-red-50    border border-red-200    rounded-full px-2.5 py-0.5">✕ {errCount} failed</span>}
              {busyCount  > 0 && <span className="text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-full px-2.5 py-0.5 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{busyCount} remaining</span>}
              <div className="ml-auto flex items-center gap-2">
                {busyCount === 0 && items.length > 0 && (
                  <button
                    onClick={clearDone}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Clear finished
                  </button>
                )}
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add more
                </button>
              </div>
            </div>
          )}

          {/* ── File list ── */}
          <AnimatePresence initial={false}>
            {items.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 shadow-sm',
                  item.status === 'done'       && 'border-emerald-200',
                  item.status === 'duplicate'  && 'border-amber-200',
                  item.status === 'error'      && 'border-red-200',
                  item.status === 'processing' && 'border-primary-200',
                  item.status === 'queued'     && 'border-slate-100',
                )}
              >
                {/* Icon / spinner */}
                <div className="mt-0.5 shrink-0">
                  {item.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-primary-500" />}
                  {item.status === 'done'       && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {item.status === 'duplicate'  && <Copy className="h-4 w-4 text-amber-500" />}
                  {item.status === 'error'      && <AlertCircle className="h-4 w-4 text-red-400" />}
                  {item.status === 'queued'     && fileIcon(item.file)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{item.file.name}</p>

                  {item.status === 'queued' && (
                    <p className="text-xs text-slate-400 mt-0.5">Queued…</p>
                  )}
                  {item.status === 'processing' && (
                    <p className="text-xs text-primary-500 mt-0.5">Analysing with AI…</p>
                  )}
                  {item.status === 'done' && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.name && <span className="text-xs font-semibold text-slate-700">{item.name}</span>}
                      {item.rank && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2 py-0.5">
                          <Anchor className="h-3 w-3" />{item.rank}
                        </span>
                      )}
                      {!!item.service && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                          <Clock className="h-3 w-3 text-slate-400" />{monthsLabel(item.service)}
                        </span>
                      )}
                      {item.score !== undefined && (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 border',
                          item.score > 0
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200',
                        )}>
                          <Zap className="h-3 w-3" />{item.score}% match
                        </span>
                      )}
                    </div>
                  )}
                  {(item.status === 'duplicate' || item.status === 'error') && item.message && (
                    <p className={cn(
                      'text-xs mt-0.5',
                      item.status === 'duplicate' ? 'text-amber-600' : 'text-red-500',
                    )}>
                      {item.message}
                    </p>
                  )}
                </div>

                {/* Remove button */}
                {item.status !== 'processing' && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="shrink-0 rounded-lg p-1 text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* ── Empty state ── */}
          {!hasItems && (
            <p className="text-center text-xs text-slate-300 pt-2">
              Supports PDF, DOCX, DOC, XLS and XLSX — drop multiple files at once
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
