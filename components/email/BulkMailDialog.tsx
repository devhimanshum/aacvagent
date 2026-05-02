'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mail, Send, RefreshCw, CheckCircle2, XCircle,
  Users, ChevronDown, Eye, ChevronRight,
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
function sub(text: string, r: Recipient): string {
  return text
    .replace(/\{\{name\}\}/gi,      r.name)
    .replace(/\{\{firstName\}\}/gi, r.name.split(' ')[0] ?? r.name)
    .replace(/\{\{rank\}\}/gi,      r.currentRank ?? '');
}

// ── Rendered preview of one email ─────────────────────────────
function EmailPreview({
  recipient, subject, body,
}: { recipient: Recipient; subject: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 space-y-1">
        <div className="flex gap-2">
          <span className="text-slate-400 font-semibold w-12 shrink-0">To</span>
          <span className="text-slate-700 font-medium truncate">
            {recipient.name} &lt;{recipient.email}&gt;
          </span>
        </div>
        <div className="flex gap-2">
          <span className="text-slate-400 font-semibold w-12 shrink-0">Subject</span>
          <span className="text-slate-800 font-semibold truncate">
            {subject ? sub(subject, recipient) : <span className="text-slate-300 italic">No subject</span>}
          </span>
        </div>
      </div>
      <div className="px-3 py-3 max-h-48 overflow-y-auto">
        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
          {body ? sub(body, recipient) : <span className="text-slate-300 italic">No content…</span>}
        </p>
      </div>
    </div>
  );
}

// ── Recipient status row ──────────────────────────────────────
function RecipientItem({
  row, subject, body,
}: { row: RecipientRow; subject: string; body: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      'border-b border-slate-100 last:border-0 transition-colors',
      row.status === 'sent'    && 'bg-emerald-50/40',
      row.status === 'failed'  && 'bg-red-50/40',
      row.status === 'sending' && 'bg-blue-50/40',
    )}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Avatar initial */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">
          {row.name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{row.name}</p>
          <p className="text-[11px] text-slate-400 truncate">{row.email}</p>
        </div>

        {row.currentRank && (
          <span className="hidden sm:block text-[11px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 shrink-0 max-w-[100px] truncate">
            {row.currentRank}
          </span>
        )}

        {/* Preview toggle */}
        {row.status === 'idle' && subject && body && (
          <button
            onClick={() => setOpen(o => !o)}
            className="shrink-0 text-slate-300 hover:text-primary-500 transition-colors"
            title="Preview personalised email"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Status indicator */}
        <div className="shrink-0 w-6 flex items-center justify-center">
          {row.status === 'idle'    && <ChevronRight className="h-3.5 w-3.5 text-slate-200" />}
          {row.status === 'sending' && <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />}
          {row.status === 'sent'    && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {row.status === 'failed'  && (
            <span title={row.error}>
              <XCircle className="h-4 w-4 text-red-400 cursor-help" />
            </span>
          )}
        </div>
      </div>

      {/* Per-recipient preview (expanded) */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              <EmailPreview recipient={row} subject={subject} body={body} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error message */}
      {row.status === 'failed' && row.error && (
        <p className="px-4 pb-2.5 text-[11px] text-red-500">{row.error}</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
export function BulkMailDialog({ candidates, onClose }: Props) {
  const [templates,    setTemplates]    = useState<EmailTemplate[]>([]);
  const [templateId,   setTemplateId]   = useState('custom');
  const [subject,      setSubject]      = useState('');
  const [body,         setBody]         = useState('');
  const [rows,         setRows]         = useState<RecipientRow[]>(
    candidates.map(c => ({ ...c, status: 'idle' })),
  );
  const [sending,      setSending]      = useState(false);
  const [done,         setDone]         = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab,    setActiveTab]    = useState<'compose' | 'recipients'>('compose');

  useEffect(() => {
    apiClient.get<{ success: boolean; data: EmailTemplate[] }>('/api/email-templates')
      .then(res => setTemplates(res.data ?? []))
      .catch(() => {});
  }, []);

  function applyTemplate(id: string) {
    setTemplateId(id);
    setShowDropdown(false);
    if (id === 'custom') { setSubject(''); setBody(''); return; }
    const tpl = templates.find(t => t.id === id);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    setSending(true);
    setActiveTab('recipients');

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === 'sent') continue;

      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'sending' } : r));

      try {
        const r = rows[i];
        const res = await apiClient.post<{
          success: boolean;
          data?: { id: string; email: string; status: 'sent' | 'failed'; error?: string }[];
          error?: string;
        }>('/api/email-templates/send', {
          recipients: [{ id: r.id, name: r.name, email: r.email, currentRank: r.currentRank }],
          subject,
          body,
        });

        // Check the per-recipient result — API returns success:true even for individual failures
        const result = res.data?.[0];
        if (result?.status === 'failed') {
          throw new Error(result.error ?? 'Send failed');
        }
        if (!res.success) {
          throw new Error(res.error ?? 'Send failed');
        }

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
  const readyToSend = !sending && !done && !!subject.trim() && !!body.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={!sending ? onClose : undefined}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-2xl max-h-[95vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50">
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
            className={cn(
              'rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-colors',
              sending && 'opacity-30 cursor-not-allowed',
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-0 border-b border-slate-100 shrink-0">
          {(['compose', 'recipients'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-2.5 text-xs font-semibold transition-colors capitalize',
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/40'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {tab === 'compose' ? '✍️ Compose' : `👥 Recipients (${totalCount})`}
            </button>
          ))}
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* COMPOSE TAB */}
          {activeTab === 'compose' && (
            <div className="p-5 space-y-5">

              {/* Template picker */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                  Template
                </label>
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(d => !d)}
                    disabled={sending}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 h-10 text-sm text-slate-700 hover:bg-white hover:border-slate-300 transition-all disabled:opacity-60"
                  >
                    <span className="font-medium">
                      {templateId === 'custom'
                        ? 'Custom (blank)'
                        : (selectedTpl?.name ?? 'Select template…')}
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', showDropdown && 'rotate-180')} />
                  </button>
                  <AnimatePresence>
                    {showDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.1 }}
                        className="absolute top-full left-0 right-0 mt-1 z-30 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
                      >
                        <button
                          onClick={() => applyTemplate('custom')}
                          className={cn(
                            'flex w-full items-center px-4 py-3 text-sm hover:bg-slate-50 transition-colors',
                            templateId === 'custom' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700',
                          )}
                        >
                          Custom (blank)
                        </button>
                        {templates.length === 0 && (
                          <p className="px-4 py-3 text-xs text-slate-400 italic border-t border-slate-100">
                            No saved templates — create them in Settings → Email Templates
                          </p>
                        )}
                        {templates.map(t => (
                          <button
                            key={t.id}
                            onClick={() => applyTemplate(t.id)}
                            className={cn(
                              'flex w-full flex-col items-start px-4 py-3 text-sm hover:bg-slate-50 transition-colors border-t border-slate-100 first:border-0',
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

              {/* Subject */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                  Subject
                </label>
                <VariableInput
                  value={subject}
                  onChange={setSubject}
                  placeholder="e.g. Your Application — {{rank}} Position"
                  disabled={sending}
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                  Message Body
                </label>
                <VariableEditor
                  value={body}
                  onChange={setBody}
                  rows={10}
                  placeholder={'Dear {{firstName}},\n\nThank you for applying for the {{rank}} position…'}
                  disabled={sending}
                />
              </div>

              {/* Preview of first recipient */}
              {subject && body && rows[0] && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Eye className="h-3 w-3" /> Preview — {rows[0].name}
                  </p>
                  <EmailPreview recipient={rows[0]} subject={subject} body={body} />
                </div>
              )}
            </div>
          )}

          {/* RECIPIENTS TAB */}
          {activeTab === 'recipients' && (
            <div className="divide-y divide-slate-100">
              {rows.map(r => (
                <RecipientItem key={r.id} row={r} subject={subject} body={body} />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
          {/* Status */}
          <div className="text-xs text-slate-500 min-w-0">
            {sending && (
              <span className="text-blue-600 font-semibold flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Sending {sentCount + 1} of {totalCount}…
              </span>
            )}
            {done && (
              <span className={cn('font-semibold', failedCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                {failedCount > 0
                  ? `${sentCount} sent, ${failedCount} failed`
                  : `All ${sentCount} emails sent ✓`}
              </span>
            )}
            {!sending && !done && (
              <span className="text-slate-400">
                {readyToSend
                  ? `Ready to send to ${totalCount} recipient${totalCount !== 1 ? 's' : ''}`
                  : 'Fill in subject & body to send'}
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
                onClick={activeTab === 'compose' ? () => setActiveTab('recipients') : handleSend}
                disabled={sending || !subject.trim() || !body.trim()}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-40',
                  activeTab === 'compose'
                    ? 'bg-slate-700 hover:bg-slate-800'
                    : 'bg-blue-600 hover:bg-blue-700',
                )}
              >
                {activeTab === 'compose' ? (
                  <>Review Recipients <ChevronRight className="h-3.5 w-3.5" /></>
                ) : sending ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Sending…</>
                ) : (
                  <><Send className="h-3.5 w-3.5" />Send to all ({totalCount})</>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
