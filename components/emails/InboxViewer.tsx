'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Paperclip, CheckCircle2,
  Star, FileText, File, X, Mail, Inbox,
  AlertCircle, ArrowLeft, Calendar, User,
  Zap, ChevronLeft, ChevronRight, Eye,
  Download, Clock, ImageIcon, FileCode, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/utils/api-client';
import { cn, timeAgo, formatDateTime, fileSizeLabel } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { OutlookEmail, EmailAttachment, ProcessEmailResult } from '@/types';

const PAGE_SIZE = 20;

// ─── Avatar helpers ───────────────────────────────────────────
const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',     'from-indigo-500 to-blue-600',
  'from-teal-500 to-emerald-600',  'from-fuchsia-500 to-violet-600',
];
const getAvatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
const getInitials    = (name: string) =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';

// ─── File type helpers ────────────────────────────────────────
function fileIcon(contentType: string, isCVFile?: boolean) {
  if (isCVFile) return <FileText className="h-5 w-5 text-primary-500" />;
  if (contentType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-blue-400" />;
  if (contentType === 'application/pdf') return <FileText className="h-5 w-5 text-red-400" />;
  return <File className="h-5 w-5 text-slate-400" />;
}
function canPreview(contentType: string) {
  return (
    contentType === 'application/pdf' ||
    contentType.startsWith('image/') ||
    contentType === 'text/plain'
  );
}

// ─── Skeleton rows ────────────────────────────────────────────
function EmailRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-4 border-b border-slate-100">
      <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <div className="h-3.5 w-28 rounded bg-slate-200 animate-pulse" />
          <div className="h-3 w-12 rounded bg-slate-200 animate-pulse" />
        </div>
        <div className="h-3 w-48 rounded bg-slate-200 animate-pulse" />
        <div className="h-2.5 w-full rounded bg-slate-200 animate-pulse" />
      </div>
    </div>
  );
}

// ─── Email Row ────────────────────────────────────────────────
function EmailRow({ email, selected, onClick, index }: {
  email: OutlookEmail; selected: boolean; onClick: () => void; index: number;
}) {
  const name    = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown';
  const isUnread = !email.isRead;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.25) }}
      onClick={onClick}
      className={cn(
        'relative flex cursor-pointer items-start gap-3 px-4 py-3.5 border-b border-slate-100',
        'transition-all duration-150',
        selected
          ? 'bg-primary-50 border-l-[3px] border-l-primary-500'
          : 'hover:bg-slate-50 border-l-[3px] border-l-transparent',
      )}
    >
      {isUnread && !selected && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary-500" />
      )}
      <div className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        'bg-gradient-to-br text-white text-xs font-bold shadow-sm',
        getAvatarColor(name)
      )}>
        {getInitials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>
            {name}
          </span>
          <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(email.receivedDateTime)}</span>
        </div>
        <p className={cn('truncate text-xs mt-0.5', isUnread ? 'font-semibold text-slate-800' : 'text-slate-500')}>
          {email.subject || '(no subject)'}
        </p>
        <p className="truncate text-[11px] text-slate-400 mt-0.5 leading-relaxed">{email.bodyPreview}</p>
        <div className="mt-1.5 flex items-center gap-2.5">
          {email.hasAttachments && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <Paperclip className="h-2.5 w-2.5" /> Attachment
            </span>
          )}
          {(email as OutlookEmail & { processed?: boolean }).processed && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
              <CheckCircle2 className="h-2.5 w-2.5" /> Processed
            </span>
          )}
          {email.importance === 'high' && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
              <Star className="h-2.5 w-2.5 fill-amber-500" /> Important
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Attachment Preview Modal ─────────────────────────────────
function AttachmentPreviewModal({ emailId, attachment, onClose }: {
  emailId: string;
  attachment: EmailAttachment & { isCVFile?: boolean };
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient.post<{ success: boolean; data: { base64: string; contentType: string; name: string } }>(
          '/api/emails/attachment', { emailId, attachmentId: attachment.id }
        );
        if (!cancelled) setDataUrl(`data:${res.data.contentType};base64,${res.data.base64}`);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load attachment');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [emailId, attachment.id]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = attachment.name;
    a.click();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: '90vw', maxWidth: 860, height: '88vh' }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {fileIcon(attachment.contentType, attachment.isCVFile)}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{attachment.name}</p>
                <p className="text-xs text-slate-400">{fileSizeLabel(attachment.size)} · {attachment.contentType}</p>
              </div>
              {attachment.isCVFile && (
                <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">CV</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {dataUrl && (
                <button onClick={handleDownload} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors">
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              )}
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex items-center justify-center bg-slate-50">
            {loading ? (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-primary-500 animate-spin" />
                <p className="text-sm">Loading preview…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 text-center px-8">
                <AlertCircle className="h-10 w-10 text-red-400" />
                <p className="text-sm font-medium text-slate-600">Preview failed</p>
                <p className="text-xs text-slate-400">{error}</p>
              </div>
            ) : dataUrl ? (
              attachment.contentType.startsWith('image/') ? (
                <img src={dataUrl} alt={attachment.name} className="max-h-full max-w-full object-contain p-4 rounded-lg" />
              ) : attachment.contentType === 'application/pdf' ? (
                <iframe src={dataUrl} className="h-full w-full border-0" title={attachment.name} />
              ) : attachment.contentType === 'text/plain' ? (
                <div className="h-full w-full overflow-auto p-6">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                    {atob(dataUrl.split(',')[1])}
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center px-8">
                  <FileCode className="h-14 w-14 text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-600">No preview available</p>
                    <p className="text-xs text-slate-400 mt-1">This file type can't be previewed in the browser.</p>
                  </div>
                  <button onClick={handleDownload} className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
                    <Download className="h-4 w-4" /> Download file
                  </button>
                </div>
              )
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Attachment Card ──────────────────────────────────────────
function AttachmentCard({ emailId, attachment }: {
  emailId: string;
  attachment: EmailAttachment & { isCVFile?: boolean };
}) {
  const [previewing, setPreviewing] = useState(false);
  const preview = canPreview(attachment.contentType);

  return (
    <>
      <div className={cn(
        'group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all',
        attachment.isCVFile
          ? 'border-primary-200 bg-primary-50 hover:border-primary-300 hover:bg-primary-100/70'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      )}>
        <div className="shrink-0">{fileIcon(attachment.contentType, attachment.isCVFile)}</div>
        <div className="min-w-0 flex-1">
          <p className={cn('text-xs font-semibold truncate', attachment.isCVFile ? 'text-primary-800' : 'text-slate-700')}>
            {attachment.name}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{fileSizeLabel(attachment.size)}</p>
        </div>
        {attachment.isCVFile && (
          <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">CV</span>
        )}
        {preview && (
          <button
            onClick={() => setPreviewing(true)}
            title="Preview"
            className={cn(
              'shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all',
              attachment.isCVFile
                ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
        )}
      </div>

      {previewing && (
        <AttachmentPreviewModal emailId={emailId} attachment={attachment} onClose={() => setPreviewing(false)} />
      )}
    </>
  );
}

// ─── Email Detail ─────────────────────────────────────────────
function EmailDetail({ email, onClose, onProcess, processing, isMobile }: {
  email: OutlookEmail;
  onClose: () => void;
  onProcess: (id: string) => void;
  processing: boolean;
  isMobile: boolean;
}) {
  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const em         = email as OutlookEmail & { processed?: boolean; processedRecord?: { processedAt: string; attachmentName?: string } | null };
  const senderName = email.from?.emailAddress?.name || 'Unknown';
  const senderAddr = email.from?.emailAddress?.address || '';
  const cvFiles    = email.attachments?.filter(a => (a as EmailAttachment & { isCVFile?: boolean }).isCVFile) ?? [];
  const allAttach  = email.attachments ?? [];

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    const isHtml = email.body?.contentType === 'html';
    const raw    = email.body?.content ?? '';

    const plainTextToHtml = (text: string) => {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const linked  = escaped.replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      return `<div class="plain-text">${linked}</div>`;
    };

    const body     = raw ? (isHtml ? raw : plainTextToHtml(raw)) : '';
    const fallback = `<p class="no-content">No message content available.</p>`;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { overflow-x: hidden; scroll-behavior: smooth; }
  body { margin:0; padding:28px 36px 40px; background:#fff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:1.8; color:#374151; word-break:break-word; overflow-wrap:anywhere; -webkit-font-smoothing:antialiased; }
  a { color:#4f46e5; text-decoration:none; word-break:break-all; }
  a:hover { text-decoration:underline; }
  h1,h2,h3,h4,h5,h6 { color:#111827; font-weight:700; line-height:1.3; margin:20px 0 8px; }
  h1{font-size:20px;}h2{font-size:17px;}h3{font-size:15px;}h4,h5,h6{font-size:14px;}
  p { margin:0 0 12px; } p:last-child { margin-bottom:0; }
  ul,ol { padding-left:22px; margin:8px 0 12px; } li { margin-bottom:5px; line-height:1.6; }
  img { max-width:100%!important; height:auto!important; display:inline-block; border-radius:6px; vertical-align:middle; }
  table { border-collapse:collapse; max-width:100%!important; width:auto!important; }
  table[border="0"],table[cellpadding="0"] { border:none; }
  table[border]:not([border="0"]) td, table[border]:not([border="0"]) th { border:1px solid #e5e7eb; padding:8px 12px; font-size:13px; vertical-align:top; }
  table[border]:not([border="0"]) th { background:#f9fafb; font-weight:600; color:#111827; }
  td,th { vertical-align:top; }
  hr { border:none; border-top:1px solid #e5e7eb; margin:20px 0; }
  pre { background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:14px 18px; font-size:12.5px; font-family:'SF Mono','Fira Code',monospace; overflow-x:auto; white-space:pre; line-height:1.6; margin:12px 0; color:#1e293b; }
  code { background:#f1f5f9; border-radius:4px; padding:1px 5px; font-size:12.5px; font-family:'SF Mono','Fira Code',monospace; color:#e11d48; }
  pre code { background:none; padding:0; color:inherit; }
  blockquote { margin:14px 0; padding:10px 16px; border-left:3px solid #c7d2fe; background:#f5f3ff; border-radius:0 8px 8px 0; color:#4b5563; font-size:13.5px; }
  blockquote p:last-child { margin-bottom:0; }
  .gmail_quote,[class*="gmail_quote"],div[style*="border-left:1px solid"],div[style*="border-left: 1px solid"] { color:#6b7280!important; font-size:13px!important; margin-top:18px; padding-top:14px; border-top:1px solid #e5e7eb; }
  div[style*="border-top:solid #E1E1E1"],div[style*="border-top: solid #E1E1E1"],div[style*="border-top:solid #e1e1e1"] { margin-top:20px!important; padding-top:16px!important; opacity:0.75; font-size:13px; color:#6b7280; }
  .plain-text { font-family:inherit; white-space:pre-wrap; font-size:14px; line-height:1.8; color:#374151; }
  [class*="MsoNormal"],[class*="MsoBodyText"] { margin:0 0 8px!important; font-family:inherit!important; font-size:14px!important; color:#374151!important; line-height:1.8!important; }
  font { line-height:inherit; }
  div[style*="width:600px"],div[style*="width: 600px"],div[style*="width:700px"],div[style*="width: 700px"],div[style*="width:800px"],div[style*="width: 800px"] { width:100%!important; max-width:100%!important; }
  .signature,[class*="signature"],#signature { margin-top:20px; padding-top:16px; border-top:1px solid #e5e7eb; color:#6b7280; font-size:12.5px; line-height:1.6; }
  .no-content { color:#9ca3af; font-style:italic; text-align:center; padding:40px 0; }
  ::-webkit-scrollbar { width:6px; height:6px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:999px; }
  ::-webkit-scrollbar-thumb:hover { background:#cbd5e1; }
</style>
</head>
<body>${body || fallback}</body>
</html>`);
    doc.close();
  }, [email.body?.content, email.body?.contentType, email.bodyPreview]);

  return (
    <motion.div
      initial={{ opacity: 0, x: isMobile ? 0 : 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex h-full flex-col bg-white"
    >
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 shrink-0">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {isMobile && (
            <button onClick={onClose} className="mt-0.5 shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-slate-900 leading-snug">{email.subject || '(no subject)'}</h2>
            {email.importance === 'high' && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600 font-medium">
                <Star className="h-3 w-3 fill-amber-500" /> Important
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {em.processed ? (
            <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Processed</Badge>
          ) : cvFiles.length > 0 ? (
            <Button size="sm" onClick={() => onProcess(email.id)} loading={processing} icon={<Zap className="h-3.5 w-3.5" />}>
              Process CV
            </Button>
          ) : null}
          {!isMobile && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sender meta */}
      <div className="border-b border-slate-100 px-6 py-3 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white text-xs font-bold shadow-sm', getAvatarColor(senderName))}>
            {getInitials(senderName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-slate-900">{senderName}</span>
              <span className="text-xs text-slate-400 truncate">&lt;{senderAddr}&gt;</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5">
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Calendar className="h-3 w-3" />{formatDateTime(email.receivedDateTime)}
              </span>
              {(email.toRecipients ?? []).map(r => (
                <span key={r.emailAddress.address} className="flex items-center gap-1 text-[11px] text-slate-500">
                  <User className="h-3 w-3" />To: {r.emailAddress.name || r.emailAddress.address}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Attachments */}
      {allAttach.length > 0 && (
        <div className="border-b border-slate-100 px-6 py-3 shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            {allAttach.length} Attachment{allAttach.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {allAttach.map(att => (
              <AttachmentCard key={att.id} emailId={email.id} attachment={att as EmailAttachment & { isCVFile?: boolean }} />
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-hidden bg-white">
        <iframe ref={iframeRef} sandbox="allow-same-origin" className="h-full w-full border-0" title="Email body" />
      </div>

      {/* Processed banner */}
      {em.processed && em.processedRecord && (
        <div className="border-t border-emerald-100 bg-emerald-50 px-6 py-2.5 shrink-0">
          <p className="text-xs text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            CV processed on {formatDateTime(em.processedRecord.processedAt)}
            {em.processedRecord.attachmentName && (
              <span className="text-emerald-500"> · {em.processedRecord.attachmentName}</span>
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ─── Detail loading skeleton ──────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-4 border-b border-slate-100 space-y-2">
        <div className="h-5 w-2/3 rounded-lg bg-slate-200 animate-pulse" />
        <div className="h-3.5 w-1/3 rounded bg-slate-200 animate-pulse" />
      </div>
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-36 rounded bg-slate-200 animate-pulse" />
          <div className="h-3 w-52 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 px-8 py-6 space-y-3">
        {[100, 90, 100, 75, 100, 60, 100, 85].map((w, i) => (
          <div key={i} className="h-3 rounded bg-slate-200 animate-pulse" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-2.5 bg-white">
      <button onClick={() => onChange(page - 1)} disabled={page === 1} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        <ChevronLeft className="h-3.5 w-3.5" /> Prev
      </button>
      <div className="flex items-center gap-0.5">
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 py-1 text-xs text-slate-400">…</span>
          ) : (
            <button key={p} onClick={() => onChange(p as number)} className={cn('h-7 w-7 rounded-lg text-xs font-semibold transition-all', page === p ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}>
              {p}
            </button>
          )
        )}
      </div>
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        Next <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── API response shape ───────────────────────────────────────
interface InboxResponse {
  success:    boolean;
  data:       OutlookEmail[];
  nextCursor: string | null;
  total:      number | null;
  count:      number;
}

// ─── Main InboxViewer ─────────────────────────────────────────
export function InboxViewer() {
  const [emails, setEmails]               = useState<OutlookEmail[]>([]);
  const [nextCursor, setNextCursor]       = useState<string | null>(null);
  const [totalCount, setTotalCount]       = useState<number | null>(null);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [detailEmail, setDetailEmail]     = useState<OutlookEmail | null>(null);
  const [loadingList, setLoadingList]     = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processing, setProcessing]       = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [search, setSearch]               = useState('');
  const [page, setPage]                   = useState(1);
  const [error, setError]                 = useState<string | null>(null);
  const [showDetail, setShowDetail]       = useState(false);

  // ── Initial / refresh load ────────────────────────────────────
  const fetchEmails = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    else         setRefreshing(true);
    setError(null);
    try {
      const res = await apiClient.get<InboxResponse>('/api/emails/inbox?limit=50');
      setEmails(res.data);
      setNextCursor(res.nextCursor ?? null);
      if (res.total != null) setTotalCount(res.total);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoadingList(false);
      setRefreshing(false);
    }
  }, []);

  // ── Load next page (append) ───────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await apiClient.get<InboxResponse>(
        `/api/emails/inbox?cursor=${encodeURIComponent(nextCursor)}&limit=50`
      );
      setEmails(prev => {
        // Deduplicate by id in case of overlap
        const existingIds = new Set(prev.map(e => e.id));
        const fresh = res.data.filter(e => !existingIds.has(e.id));
        return [...prev, ...fresh];
      });
      setNextCursor(res.nextCursor ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load more emails');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // ── Load ALL remaining pages ──────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      let cursor: string | null = nextCursor;
      const accumulated: OutlookEmail[] = [];

      while (cursor) {
        const page: InboxResponse = await apiClient.get<InboxResponse>(
          `/api/emails/inbox?cursor=${encodeURIComponent(cursor)}&limit=999`
        );
        accumulated.push(...page.data);
        cursor = page.nextCursor ?? null;
      }

      setEmails(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const fresh = accumulated.filter(e => !existingIds.has(e.id));
        return [...prev, ...fresh];
      });
      setNextCursor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load all emails');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // ── Fetch single email detail ─────────────────────────────────
  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: OutlookEmail }>('/api/emails/inbox', { id });
      setDetailEmail(res.data);
    } catch {
      toast.error('Could not load email — please try again');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelect = useCallback((email: OutlookEmail) => {
    setSelectedId(email.id);
    setShowDetail(true);
    setDetailEmail(null);
    fetchDetail(email.id);
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e));
  }, [fetchDetail]);

  // ── Process CV ────────────────────────────────────────────────
  const handleProcess = useCallback(async (emailId: string) => {
    setProcessing(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: ProcessEmailResult }>(
        '/api/emails/process', { emailId }
      );
      if (res.data.status === 'success') {
        toast.success('CV processed — candidate saved!');
        setEmails(prev => prev.map(e => e.id === emailId ? { ...e, processed: true } : e));
        setDetailEmail(prev => prev ? { ...prev, processed: true } : prev);
      } else if (res.data.status === 'skipped') {
        toast('Already processed', { icon: 'ℹ️' });
      } else {
        toast.error(res.data.message || 'Processing failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setProcessing(false);
    }
  }, []);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);
  useEffect(() => { setPage(1); }, [search]);

  // ── Filter + search + paginate (client-side on loaded emails) ─
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter(e =>
      e.subject?.toLowerCase().includes(q) ||
      e.from?.emailAddress?.name?.toLowerCase().includes(q) ||
      e.from?.emailAddress?.address?.toLowerCase().includes(q) ||
      e.bodyPreview?.toLowerCase().includes(q)
    );
  }, [emails, search]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const unreadCount   = useMemo(() => emails.filter(e => !e.isRead).length, [emails]);
  const loadedCount   = emails.length;
  const hasMore       = !!nextCursor;

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      {/* ════ LEFT — Email list ════ */}
      <div className={cn(
        'flex flex-col border-r border-slate-100 bg-white shrink-0',
        'w-full lg:w-[340px] xl:w-[380px]',
        showDetail ? 'hidden lg:flex' : 'flex'
      )}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Inbox</h2>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">crew.queries@shipivishtamaritime.com</p>
            </div>
            <button
              onClick={() => fetchEmails(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
              {refreshing ? 'Syncing…' : 'Refresh'}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search emails, senders…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Count row */}
          {!loadingList && (
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">
                {search
                  ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${search}"`
                  : totalCount != null
                    ? `${loadedCount} of ${totalCount} emails loaded`
                    : `${loadedCount} emails loaded`
                }
              </p>
              {hasMore && !search && (
                <button
                  onClick={loadAll}
                  disabled={loadingMore}
                  className="text-[11px] font-medium text-primary-600 hover:text-primary-800 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load all'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Email rows */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            Array(8).fill(0).map((_, i) => <EmailRowSkeleton key={i} />)
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3 py-12">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-sm font-medium text-slate-600">Connection error</p>
              <p className="text-xs text-slate-400 max-w-xs">{error}</p>
              <button onClick={() => fetchEmails()} className="text-xs text-primary-600 hover:underline font-medium mt-1">Try again</button>
            </div>
          ) : currentPage.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
              {search
                ? <><Search className="h-10 w-10 text-slate-300" /><p className="text-sm text-slate-400">No emails match "{search}"</p></>
                : <><Inbox className="h-10 w-10 text-slate-300" /><p className="text-sm text-slate-400">Inbox is empty</p></>
              }
            </div>
          ) : (
            <>
              {currentPage.map((email, i) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={email.id === selectedId}
                  onClick={() => handleSelect(email)}
                  index={i}
                />
              ))}

              {/* Load-more footer (shown when on last page and more pages exist) */}
              {page === totalPages && hasMore && !search && (
                <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/50">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
                  >
                    {loadingMore
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…</>
                      : <><Mail className="h-3.5 w-3.5" /> Load more emails{totalCount ? ` (${totalCount - loadedCount} remaining)` : ''}</>
                    }
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* ════ RIGHT — Email detail ════ */}
      <div className={cn('flex-1 min-w-0 overflow-hidden', showDetail ? 'flex flex-col' : 'hidden lg:flex lg:flex-col')}>
        <AnimatePresence mode="wait">
          {loadingDetail ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DetailSkeleton />
            </motion.div>
          ) : detailEmail ? (
            <EmailDetail
              key={detailEmail.id}
              email={detailEmail}
              onClose={() => { setShowDetail(false); setSelectedId(null); setDetailEmail(null); }}
              onProcess={handleProcess}
              processing={processing}
              isMobile={showDetail}
            />
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center text-center px-8 gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 shadow-inner">
                <Mail className="h-9 w-9 text-primary-400" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-700">Select an email to read</p>
                <p className="text-sm text-slate-400 mt-1">
                  {totalCount != null
                    ? `${loadedCount} of ${totalCount} emails loaded`
                    : unreadCount > 0
                      ? `${unreadCount} unread email${unreadCount !== 1 ? 's' : ''} waiting`
                      : `${loadedCount} emails loaded`
                  }
                </p>
              </div>
              {emails.filter(e => !(e as OutlookEmail & { processed?: boolean }).processed && e.hasAttachments).length > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 max-w-xs">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 font-medium text-left">
                    {emails.filter(e => !(e as OutlookEmail & { processed?: boolean }).processed && e.hasAttachments).length} CV{emails.filter(e => !(e as OutlookEmail & { processed?: boolean }).processed && e.hasAttachments).length !== 1 ? 's' : ''} pending processing
                  </p>
                </div>
              )}
              {hasMore && (
                <button onClick={loadAll} disabled={loadingMore} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
                  {loadingMore ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</> : <>Load all emails</>}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
