'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit2, Trash2, Save, X, Mail, FileText, Eye, EyeOff,
} from 'lucide-react';
import { VariableEditor, VariableInput, VARS } from '@/components/email/VariableEditor';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { EmailTemplate } from '@/types';

// ── Substitute variables using sample data ────────────────────
const SAMPLE = { name: 'John Smith', firstName: 'John', rank: 'Chief Officer' };

function preview(text: string): string {
  return text
    .replace(/\{\{name\}\}/gi,      SAMPLE.name)
    .replace(/\{\{firstName\}\}/gi, SAMPLE.firstName)
    .replace(/\{\{rank\}\}/gi,      SAMPLE.rank);
}

// ── Variable colour legend ────────────────────────────────────
function VarLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {VARS.map(v => (
        <span key={v.tag} className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: v.markStyle.match(/background:([^;]+)/)?.[1] }}
          />
          <code className="font-mono">{v.tag}</code>
        </span>
      ))}
    </div>
  );
}

// ── Rendered email preview pane ───────────────────────────────
function PreviewPane({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden h-full flex flex-col">
      {/* Fake email chrome */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 space-y-1.5">
        <div className="flex items-start gap-2 text-xs">
          <span className="shrink-0 font-semibold text-slate-400 w-12">To:</span>
          <span className="text-slate-600">John Smith &lt;john.smith@example.com&gt;</span>
        </div>
        <div className="flex items-start gap-2 text-xs">
          <span className="shrink-0 font-semibold text-slate-400 w-12">Subject:</span>
          <span className="text-slate-800 font-medium">
            {subject ? preview(subject) : <span className="text-slate-300 italic">No subject</span>}
          </span>
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {body ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {preview(body)}
          </p>
        ) : (
          <p className="text-sm text-slate-300 italic">No content yet…</p>
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40">
        <p className="text-[10px] text-slate-300">Preview uses sample data: {SAMPLE.name} · {SAMPLE.rank}</p>
      </div>
    </div>
  );
}

// ── Template form / editor ────────────────────────────────────
interface TemplateForm {
  id?:     string;
  name:    string;
  subject: string;
  body:    string;
}

const BLANK: TemplateForm = { name: '', subject: '', body: '' };

const STARTER_TEMPLATES: TemplateForm[] = [
  {
    name:    'Selection Notice',
    subject: 'Your Application — {{rank}} Position',
    body:
`Dear {{firstName}},

We are pleased to inform you that your application for the {{rank}} position has been shortlisted.

We would like to invite you for the next stage of our selection process. Please reply to this email at your earliest convenience to arrange a suitable time.

Thank you for your interest in joining our fleet.

Best regards,
The Recruitment Team`,
  },
  {
    name:    'Rejection Notice',
    subject: 'Regarding Your Application — {{rank}} Position',
    body:
`Dear {{firstName}},

Thank you for applying for the {{rank}} position and for the time you invested in your application.

After careful consideration, we regret to inform you that we will not be proceeding with your application at this time. We have kept your CV on file and will contact you should a suitable opportunity arise in the future.

We wish you the best in your career at sea.

Best regards,
The Recruitment Team`,
  },
  {
    name:    'Interview Invite',
    subject: 'Interview Invitation — {{rank}} Role',
    body:
`Dear {{firstName}},

I hope this message finds you well.

We have reviewed your profile for the {{rank}} position and are pleased to invite you for an interview. We were particularly impressed by your experience and qualifications.

Please reply to this email with your availability over the next week and we will arrange a convenient time.

We look forward to speaking with you.

Kind regards,
The Recruitment Team`,
  },
];

interface EditorProps {
  editing:   TemplateForm;
  onChange:  (f: TemplateForm) => void;
  onSave:    () => void;
  onCancel:  () => void;
  saving:    boolean;
}

function TemplateEditorPanel({ editing, onChange, onSave, onCancel, saving }: EditorProps) {
  const [showPreview, setShowPreview] = useState(true);

  const set = <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) =>
    onChange({ ...editing, [k]: v });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-primary-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Editor header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-primary-50 to-blue-50">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600">
            <FileText className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900">
            {editing.id ? 'Edit Template' : 'New Template'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(p => !p)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all',
              showPreview
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50',
            )}
          >
            {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      </div>

      {/* Main editor area */}
      <div className={cn('p-5 gap-5', showPreview ? 'grid grid-cols-1 lg:grid-cols-2' : 'block')}>

        {/* Left: form */}
        <div className="space-y-4">
          {/* Template name */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Template Name
            </label>
            <input
              value={editing.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Selection Notice"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-300 focus:bg-white transition-all"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Subject Line
            </label>
            <VariableInput
              value={editing.subject}
              onChange={v => set('subject', v)}
              placeholder="e.g. Your Application — {{rank}} Position"
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Message Body
            </label>
            <VariableEditor
              value={editing.body}
              onChange={v => set('body', v)}
              rows={showPreview ? 12 : 10}
              placeholder={'Dear {{firstName}},\n\n…'}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
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

        {/* Right: live preview */}
        {showPreview && (
          <div className="flex flex-col min-h-[400px]">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Eye className="h-3 w-3" /> Live Preview
            </p>
            <div className="flex-1">
              <PreviewPane subject={editing.subject} body={editing.body} />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Variable colour pills for template card ───────────────────
function detectVars(text: string) {
  const found: string[] = [];
  for (const v of VARS) {
    if (new RegExp(v.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
      found.push(v.tag);
    }
  }
  return found;
}

// ══════════════════════════════════════════════════════════════
export function EmailTemplatesPanel() {
  const [templates,  setTemplates]  = useState<EmailTemplate[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState<TemplateForm | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [addingStarter, setAddingStarter] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.get<{ success: boolean; data: EmailTemplate[] }>('/api/email-templates')
      .then(res => setTemplates(res.data ?? []))
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const startNew  = () => { setEditing({ ...BLANK }); };
  const startEdit = (t: EmailTemplate) =>
    setEditing({ id: t.id, name: t.name, subject: t.subject, body: t.body });
  const cancelEdit = () => setEditing(null);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.subject.trim() || !editing.body.trim()) {
      toast.error('Name, subject and body are all required');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/api/email-templates', { action: 'save', template: editing });
      toast.success(editing.id ? 'Template updated!' : 'Template saved!');
      setEditing(null);
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

  const addStarter = async (tpl: TemplateForm) => {
    setAddingStarter(true);
    try {
      await apiClient.post('/api/email-templates', { action: 'save', template: tpl });
      toast.success(`"${tpl.name}" added!`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAddingStarter(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Email Templates</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Reusable templates with smart variables — one click inserts personalised values
          </p>
        </div>
        {!editing && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> New Template
          </button>
        )}
      </div>

      {/* Variable legend */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Available Variables</p>
        <VarLegend />
        <p className="text-[11px] text-slate-400 mt-2">
          Click any variable chip in the editor to insert it at the cursor position.
          Variables are replaced with each candidate&apos;s real data when the email is sent.
        </p>
      </div>

      {/* Editor */}
      <AnimatePresence>
        {editing && (
          <TemplateEditorPanel
            editing={editing}
            onChange={setEditing}
            onSave={save}
            onCancel={cancelEdit}
            saving={saving}
          />
        )}
      </AnimatePresence>

      {/* Template list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : templates.length === 0 && !editing ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
            <Mail className="h-7 w-7 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">No templates yet</p>
          <p className="text-xs text-slate-400 mb-5">Add a starter template or create your own</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 px-4">
            {STARTER_TEMPLATES.map(t => (
              <button
                key={t.name}
                onClick={() => addStarter(t)}
                disabled={addingStarter}
                className="flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" /> {t.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => {
            const usedVars = detectVars(t.subject + ' ' + t.body);
            const isEditing = editing?.id === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  'rounded-2xl border bg-white transition-all',
                  isEditing ? 'border-primary-200 opacity-40 pointer-events-none' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm',
                )}
              >
                <div className="flex items-start gap-4 p-4">
                  {/* Icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
                    <Mail className="h-4.5 w-4.5 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{t.subject}</p>
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(t)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                        {confirmDel === t.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => del(t.id)}
                              disabled={deleting === t.id}
                              className="rounded-lg bg-red-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition-colors"
                            >
                              {deleting === t.id ? '…' : 'Delete?'}
                            </button>
                            <button
                              onClick={() => setConfirmDel(null)}
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDel(t.id)}
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Body preview */}
                    <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 whitespace-pre-wrap leading-relaxed">
                      {t.body}
                    </p>

                    {/* Variable tags used */}
                    {usedVars.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {usedVars.map(v => {
                          const meta = VARS.find(x => x.tag === v);
                          return (
                            <span
                              key={v}
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-bold font-mono',
                                meta?.chipColor ?? 'bg-slate-100 text-slate-500 border-slate-200',
                              )}
                            >
                              {v}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add more starters */}
          {templates.length > 0 && !editing && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs text-slate-400">Add starter:</span>
              {STARTER_TEMPLATES.filter(s => !templates.some(t => t.name === s.name)).map(s => (
                <button
                  key={s.name}
                  onClick={() => addStarter(s)}
                  disabled={addingStarter}
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
