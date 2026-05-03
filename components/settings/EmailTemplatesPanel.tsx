'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, Save, X, Mail, Check } from 'lucide-react';
import { VariableEditor, VariableInput, VARS } from '@/components/email/VariableEditor';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { EmailTemplate } from '@/types';

// ── Starter templates ─────────────────────────────────────────
const STARTERS = [
  {
    name:    'Selection Notice',
    subject: 'Your Application — {{rank}} Position',
    body:    `Dear {{firstName}},

We are pleased to inform you that your application for the {{rank}} position has been shortlisted.

We would like to invite you for the next stage of our selection process. Please reply to this email at your earliest convenience to arrange a suitable time.

Thank you for your interest in joining our fleet.

Best regards,
The Recruitment Team`,
  },
  {
    name:    'Rejection Notice',
    subject: 'Regarding Your Application — {{rank}} Position',
    body:    `Dear {{firstName}},

Thank you for applying for the {{rank}} position and for the time you invested in your application.

After careful consideration, we regret to inform you that we will not be proceeding with your application at this time. We have kept your CV on file and will contact you should a suitable opportunity arise in the future.

We wish you the best in your career at sea.

Best regards,
The Recruitment Team`,
  },
  {
    name:    'Interview Invite',
    subject: 'Interview Invitation — {{rank}} Role',
    body:    `Dear {{firstName}},

I hope this message finds you well.

We have reviewed your profile for the {{rank}} position and are pleased to invite you for an interview.

Please reply with your availability over the next week and we will arrange a convenient time.

We look forward to speaking with you.

Kind regards,
The Recruitment Team`,
  },
];

interface FormState { id?: string; name: string; subject: string; body: string }
const BLANK: FormState = { name: '', subject: '', body: '' };

// ── Inline editor ─────────────────────────────────────────────
function TemplateEditor({
  form, onChange, onSave, onCancel, saving,
}: {
  form:     FormState;
  onChange: (f: FormState) => void;
  onSave:   () => void;
  onCancel: () => void;
  saving:   boolean;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...form, [k]: v });

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className="rounded-2xl border border-primary-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-primary-50/60">
        <span className="text-sm font-bold text-slate-800">
          {form.id ? 'Edit Template' : 'New Template'}
        </span>
        <button
          onClick={onCancel}
          className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Name */}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Template name</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Selection Notice"
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-300 focus:bg-white transition-all"
          />
        </div>

        {/* Subject */}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Subject line</label>
          <VariableInput
            value={form.subject}
            onChange={v => set('subject', v)}
            placeholder="e.g. Your Application — {{rank}} Position"
          />
        </div>

        {/* Body */}
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Message body</label>
          <VariableEditor
            value={form.body}
            onChange={v => set('body', v)}
            rows={11}
            placeholder={'Dear {{firstName}},\n\n…'}
          />
          {/* Variable hint */}
          <div className="flex items-center gap-3 flex-wrap mt-1.5">
            {VARS.map(v => (
              <span key={v.tag} className="flex items-center gap-1 text-[11px] text-slate-400">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: v.markBg }} />
                <code className="font-mono">{v.tag}</code>
              </span>
            ))}
            <span className="text-[11px] text-slate-300">replaced per recipient when sent</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors"
          >
            {saving
              ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : 'Save Template'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
export function EmailTemplatesPanel() {
  const [templates,  setTemplates]  = useState<EmailTemplate[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [form,       setForm]       = useState<FormState | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiClient.get<{ success: boolean; data: EmailTemplate[] }>('/api/email-templates')
      .then(res => setTemplates(res.data ?? []))
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error('Please fill in name, subject, and message body');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/api/email-templates', { action: 'save', template: form });
      toast.success(form.id ? 'Template updated!' : 'Template saved!');
      setForm(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try {
      await apiClient.post('/api/email-templates', { action: 'delete', id });
      toast.success('Template deleted');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const addStarter = async (s: typeof STARTERS[0]) => {
    setSaving(true);
    try {
      await apiClient.post('/api/email-templates', { action: 'save', template: s });
      toast.success(`"${s.name}" added!`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  // Starters not yet saved
  const missingStarters = STARTERS.filter(s => !templates.some(t => t.name === s.name));

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Email Templates</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Reusable email templates with personalised variables
          </p>
        </div>
        {!form && (
          <button
            onClick={() => setForm({ ...BLANK })}
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> New Template
          </button>
        )}
      </div>

      {/* Inline editor */}
      <AnimatePresence>
        {form && (
          <TemplateEditor
            form={form}
            onChange={setForm}
            onSave={save}
            onCancel={() => setForm(null)}
            saving={saving}
          />
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>

      /* Empty state */
      ) : templates.length === 0 && !form ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
            <Mail className="h-6 w-6 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">No templates yet</p>
          <p className="text-xs text-slate-400 mb-5">Start from a ready-made template or create your own</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 px-4">
            {STARTERS.map(s => (
              <button
                key={s.name}
                onClick={() => addStarter(s)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" /> {s.name}
              </button>
            ))}
          </div>
        </div>

      /* Template list */
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const isOpen = form?.id === t.id;
            return (
              <div key={t.id} className={cn('rounded-2xl border bg-white transition-all', isOpen ? 'opacity-40 pointer-events-none border-slate-200' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm')}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
                    <Mail className="h-4 w-4 text-white" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{t.subject}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDel === t.id ? (
                      <>
                        <button
                          onClick={() => del(t.id)}
                          disabled={deleting === t.id}
                          className="flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition-colors"
                        >
                          {deleting === t.id
                            ? <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            : <Check className="h-3 w-3" />}
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDel(null)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setForm({ id: t.id, name: t.name, subject: t.subject, body: t.body })}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                        <button
                          onClick={() => setConfirmDel(t.id)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-300 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add missing starters */}
          {missingStarters.length > 0 && !form && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs text-slate-400">Add starter:</span>
              {missingStarters.map(s => (
                <button
                  key={s.name}
                  onClick={() => addStarter(s)}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg border border-dashed border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" /> {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
