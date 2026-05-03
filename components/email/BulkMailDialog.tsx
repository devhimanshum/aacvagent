'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mail, Send, RefreshCw, CheckCircle2, XCircle, Users, ChevronDown,
} from 'lucide-react';
import { VariableEditor, VariableInput } from '@/components/email/VariableEditor';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { EmailTemplate } from '@/types';

// ── Types ─────────────────────────────────────────────────────
interface Recipient {
  id:           string;
  name:         string;
  email:        string;
  currentRank?: string;
}

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

interface RecipientRow extends Recipient {
  status: SendStatus;
  error?: string;
}

interface Props {
  candidates: Recipient[];
  onClose:    () => void;
}

// ── Variable substitution ─────────────────────────────────────
function sub(text: string, r: Recipient) {
  return text
    .replace(/\{\{name\}\}/gi,      r.name)
    .replace(/\{\{firstName\}\}/gi, r.name.split(' ')[0] ?? r.name)
    .replace(/\{\{rank\}\}/gi,      r.currentRank ?? '');
}

// ══════════════════════════════════════════════════════════════
export function BulkMailDialog({ candidates, onClose }: Props) {
  const [templates,    setTemplates]    = useState<EmailTemplate[]>([]);
  const [templateId,   setTemplateId]   = useState('custom');
  const [showTplPick,  setShowTplPick]  = useState(false);
  const [subject,      setSubject]      = useState('');
  const [body,         setBody]         = useState('');
  const [rows,         setRows]         = useState<RecipientRow[]>(
    candidates.map(c => ({ ...c, status: 'idle' })),
  );
  const [sending,      setSending]      = useState(false);
  const [done,         setDone]         = useState(false);
  const [showRcptList, setShowRcptList] = useState(false);

  useEffect(() => {
    apiClient.get<{ success: boolean; data: EmailTemplate[] }>('/api/email-templates')
      .then(res => setTemplates(res.data ?? []))
      .catch(() => {});
  }, []);

  function applyTemplate(id: string) {
    setTemplateId(id);
    setShowTplPick(false);
    if (id === 'custom') { setSubject(''); setBody(''); return; }
    const tpl = templates.find(t => t.id === id);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and message body are required');
      return;
    }
    setSending(true);
    setShowRcptList(true);

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === 'sent') continue;

      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'sending' } : r));

      try {
        const r = rows[i];
        const res = await apiClient.post<{
          success: boolean;
          data?:   { id: string; email: string; status: 'sent' | 'failed'; error?: string }[];
          error?:  string;
        }>('/api/email-templates/send', {
          recipients: [{ id: r.id, name: r.name, email: r.email, currentRank: r.currentRank }],
          subject,
          body,
        });

        const result = res.data?.[0];
        if (result?.status === 'failed') throw new Error(result.error ?? 'Send failed');
        if (!res.success)                throw new Error(res.error  ?? 'Send failed');

        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'sent' } : r));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed';
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'failed', error: msg } : r));
      }
    }

    setSending(false);
    setDone(true);
  }

  const sentCount   = rows.filter(r => r.status === 'sent').length;
  const failedCount = rows.filter(r => r.status === 'failed').length;
  const totalCount  = rows.length;
  const selectedTpl = templates.find(t => t.id === templateId);
  const canSend     = !sending && !done && !!subject.trim() && !!body.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={!sending ? onClose : undefined}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-xl max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
              <Mail className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Send Bulk Email</h2>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Users className="h-3 w-3" />
                {totalCount} recipient{totalCount !== 1 ? 's' : ''}
                {done && (
                  <span className={cn('ml-1 font-semibold', failedCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                    · {sentCount} sent{failedCount > 0 ? `, ${failedCount} failed` : ' ✓'}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={!sending ? onClose : undefined}
            className={cn('rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-colors', sending && 'opacity-30 cursor-not-allowed')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* ── Template picker ── */}
            {!done && (
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Template</label>
                <div className="relative">
                  <button
                    onClick={() => setShowTplPick(d => !d)}
                    disabled={sending}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 h-10 text-sm text-slate-700 hover:bg-white hover:border-slate-300 transition-all disabled:opacity-60"
                  >
                    <span className="font-medium">
                      {templateId === 'custom' ? 'Write custom message' : (selectedTpl?.name ?? 'Select template…')}
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', showTplPick && 'rotate-180')} />
                  </button>
                  <AnimatePresence>
                    {showTplPick && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.1 }}
                        className="absolute top-full left-0 right-0 mt-1 z-30 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
                      >
                        <button
                          onClick={() => applyTemplate('custom')}
                          className={cn('flex w-full items-center px-4 py-3 text-sm hover:bg-slate-50 transition-colors', templateId === 'custom' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700')}
                        >
                          Write custom message
                        </button>
                        {templates.length === 0 && (
                          <p className="px-4 py-3 text-xs text-slate-400 italic border-t border-slate-100">
                            No templates — create them in Settings → Email Templates
                          </p>
                        )}
                        {templates.map(t => (
                          <button
                            key={t.id}
                            onClick={() => applyTemplate(t.id)}
                            className={cn(
                              'flex w-full flex-col items-start px-4 py-3 text-sm hover:bg-slate-50 transition-colors border-t border-slate-100',
                              templateId === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700',
                            )}
                          >
                            <span className="font-semibold">{t.name}</span>
                            <span className="text-xs text-slate-400 truncate w-full">{t.subject}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* ── Subject ── */}
            {!done && (
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Subject</label>
                <VariableInput
                  value={subject}
                  onChange={setSubject}
                  placeholder="e.g. Your Application — {{rank}} Position"
                  disabled={sending}
                />
              </div>
            )}

            {/* ── Body ── */}
            {!done && (
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Message</label>
                <VariableEditor
                  value={body}
                  onChange={setBody}
                  rows={10}
                  placeholder={'Dear {{firstName}},\n\n…'}
                  disabled={sending}
                />
              </div>
            )}

            {/* ── Recipients list ── */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {/* Toggle header */}
              <button
                onClick={() => setShowRcptList(o => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  {done
                    ? `${sentCount} sent · ${failedCount} failed`
                    : `${totalCount} recipient${totalCount !== 1 ? 's' : ''}`}
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform', showRcptList && 'rotate-180')} />
              </button>

              {/* List */}
              <AnimatePresence>
                {showRcptList && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: 'auto' }}
                    exit={{ height: 0 }} transition={{ duration: 0.15 }}
                    className="overflow-hidden border-t border-slate-100"
                  >
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {rows.map(r => (
                        <div key={r.id} className={cn(
                          'flex items-center gap-3 px-4 py-2.5 text-xs transition-colors',
                          r.status === 'sent'    && 'bg-emerald-50/50',
                          r.status === 'failed'  && 'bg-red-50/50',
                          r.status === 'sending' && 'bg-blue-50/50',
                        )}>
                          {/* Avatar */}
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-700 truncate">{r.name}</p>
                            <p className="text-slate-400 truncate">{r.email}</p>
                            {r.status === 'failed' && r.error && (
                              <p className="text-red-500 mt-0.5 text-[11px]">{r.error}</p>
                            )}
                          </div>
                          {/* Status icon */}
                          <div className="shrink-0">
                            {r.status === 'sending' && <RefreshCw  className="h-3.5 w-3.5 text-blue-500 animate-spin" />}
                            {r.status === 'sent'    && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                            {r.status === 'failed'  && <span title={r.error}><XCircle className="h-3.5 w-3.5 text-red-400" /></span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
          {/* Status */}
          <div className="text-xs min-w-0">
            {sending && (
              <span className="text-blue-600 font-semibold flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Sending {sentCount + 1} of {totalCount}…
              </span>
            )}
            {done && (
              <span className={cn('font-semibold', failedCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                {failedCount > 0 ? `${sentCount} sent, ${failedCount} failed` : `All ${sentCount} emails sent ✓`}
              </span>
            )}
            {!sending && !done && (
              <span className="text-slate-400">
                {canSend ? `Ready to send to ${totalCount} recipient${totalCount !== 1 ? 's' : ''}` : 'Fill in subject & message to send'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={!sending ? onClose : undefined}
              disabled={sending}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              {done ? 'Close' : 'Cancel'}
            </button>
            {!done && (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {sending
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Sending…</>
                  : <><Send className="h-3.5 w-3.5" />Send to {totalCount}</>}
              </button>
            )}
          </div>
        </div>

      </motion.div>
    </div>
  );
}
