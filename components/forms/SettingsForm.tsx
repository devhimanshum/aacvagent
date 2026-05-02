'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, BrainCircuit, CheckCircle, XCircle,
  RefreshCw, Zap, Eye, EyeOff, Save, ChevronDown, ChevronUp, Sheet, Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { TokenUsagePanel } from '@/components/settings/TokenUsagePanel';
import { EmailTemplatesPanel } from '@/components/settings/EmailTemplatesPanel';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';

interface SettingsData {
  outlook: { configured: boolean; source: string; inboxEmail: string; clientId: string };
  openai:  { configured: boolean; source: string; model: string; keyHint: string };
  gemini?: { configured: boolean; model: string };
  sheet?:  { configured: boolean; sheetUrl: string };
}

type Tab = 'connections' | 'usage' | 'templates';

/* ── Small input component ── */
function Field({
  label, value, onChange, placeholder, secret = false, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <div className="relative">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-400 focus:bg-white transition-all"
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/* ── Status row ── */
function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-700">{value}</span>
    </div>
  );
}

export function SettingsForm() {
  const [data,    setData]    = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<Tab>('connections');

  // Outlook form state
  const [outlookOpen,  setOutlookOpen]  = useState(false);
  const [oClientId,    setOClientId]    = useState('');
  const [oTenantId,    setOTenantId]    = useState('');
  const [oSecret,      setOSecret]      = useState('');
  const [oEmail,       setOEmail]       = useState('');
  const [savingOutlook, setSavingOutlook] = useState(false);
  const [testingOutlook, setTestingOutlook] = useState(false);

  // OpenAI form state
  const [openaiOpen,   setOpenaiOpen]   = useState(false);
  const [aiKey,        setAiKey]        = useState('');
  const [aiModel,      setAiModel]      = useState('gpt-4o-mini');
  const [savingOpenAI, setSavingOpenAI] = useState(false);

  // Google Sheet form state
  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [sheetUrl,     setSheetUrl]     = useState('');
  const [savingSheet,  setSavingSheet]  = useState(false);
  const [testingSheet, setTestingSheet] = useState(false);

  // Test send state
  const [testSendEmail,   setTestSendEmail]   = useState('');
  const [testingSend,     setTestingSend]     = useState(false);

  const loadSettings = () => {
    setLoading(true);
    apiClient
      .get<{ success: boolean; data: SettingsData }>('/api/settings')
      .then(res => setData(res.data))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSettings(); }, []);

  const saveOutlook = async () => {
    if (!oClientId || !oTenantId || !oSecret || !oEmail) {
      toast.error('Please fill in all four Outlook fields');
      return;
    }
    setSavingOutlook(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/api/settings',
        { type: 'save_outlook', clientId: oClientId, tenantId: oTenantId, clientSecret: oSecret, inboxEmail: oEmail },
      );
      if (res.success) {
        toast.success(res.message);
        setOutlookOpen(false);
        setOClientId(''); setOTenantId(''); setOSecret(''); setOEmail('');
        loadSettings();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingOutlook(false);
    }
  };

  const testOutlook = async () => {
    setTestingOutlook(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/api/settings', { type: 'test_outlook' },
      );
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingOutlook(false);
    }
  };

  const saveOpenAI = async () => {
    if (!aiKey) { toast.error('Please enter your OpenAI API key'); return; }
    setSavingOpenAI(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/api/settings',
        { type: 'save_openai', apiKey: aiKey, model: aiModel },
      );
      if (res.success) {
        toast.success(res.message);
        setOpenaiOpen(false);
        setAiKey('');
        loadSettings();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingOpenAI(false);
    }
  };

  const saveSheet = async () => {
    if (!sheetUrl.trim()) { toast.error('Please enter a Google Sheet URL'); return; }
    setSavingSheet(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/api/settings',
        { type: 'save_sheet', sheetUrl: sheetUrl.trim() },
      );
      if (res.success) {
        toast.success(res.message);
        setSheetOpen(false);
        loadSettings();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingSheet(false);
    }
  };

  const testSheet = async () => {
    const urlToTest = sheetUrl.trim() || data?.sheet?.sheetUrl || '';
    if (!urlToTest) { toast.error('Enter the sheet URL first'); return; }
    setTestingSheet(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/api/settings',
        { type: 'test_sheet', sheetUrl: urlToTest },
      );
      if (res.success) toast.success(res.message);
      else toast.error(res.message, { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingSheet(false);
    }
  };

  const testSend = async () => {
    if (!testSendEmail.trim()) { toast.error('Enter a recipient email address'); return; }
    setTestingSend(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/api/settings', { type: 'test_send', toEmail: testSendEmail.trim() },
      );
      if (res.success) toast.success(res.message);
      else toast.error(res.message, { duration: 10000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingSend(false);
    }
  };

  const outlookOk = data?.outlook.configured ?? false;
  const openaiOk  = (data?.openai ?? data?.gemini)?.configured ?? false;
  const sheetOk   = data?.sheet?.configured ?? false;

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([
          { key: 'connections', label: 'Connections' },
          { key: 'usage', label: 'Token Usage', icon: <Zap className="h-3.5 w-3.5" /> },
          { key: 'templates', label: 'Email Templates', icon: <Mail className="h-3.5 w-3.5" /> },
        ] as { key: Tab; label: string; icon?: React.ReactNode }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Connections ── */}
      {tab === 'connections' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {loading ? (
            <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : (
            <>
              {/* ── Outlook card ── */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                      <Mail className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Microsoft Outlook</h3>
                      <p className="text-xs text-slate-500">
                        {outlookOk
                          ? `Connected · ${data?.outlook.inboxEmail}`
                          : 'Enter your Azure app credentials below'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={outlookOk ? 'success' : 'error'}>
                      {outlookOk
                        ? <><CheckCircle className="h-3 w-3 mr-1" />Connected</>
                        : <><XCircle className="h-3 w-3 mr-1" />Not set</>}
                    </Badge>
                    <button
                      onClick={() => setOutlookOpen(o => !o)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {outlookOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {outlookOk ? 'Update' : 'Configure'}
                    </button>
                  </div>
                </div>

                {/* Status rows when connected */}
                {outlookOk && !outlookOpen && (
                  <div className="px-5 pb-4 space-y-2">
                    <StatusRow label="Client ID"  value={data?.outlook.clientId || '••••'} />
                    <StatusRow label="Inbox"      value={data?.outlook.inboxEmail || ''} />
                    <StatusRow label="Source"     value={data?.outlook.source === 'firestore' ? 'Saved in app' : 'Environment variable'} />
                    <button
                      onClick={testOutlook}
                      disabled={testingOutlook}
                      className="flex items-center gap-1.5 mt-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', testingOutlook && 'animate-spin')} />
                      Test Connection
                    </button>
                  </div>
                )}

                {/* Config form */}
                <AnimatePresence>
                  {outlookOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="p-5 space-y-3 bg-slate-50/50">
                        <p className="text-xs text-slate-500 mb-1">
                          Get these from <strong>Azure Portal → App Registrations → your app</strong>
                        </p>
                        <Field label="Client ID (Application ID)"    value={oClientId} onChange={setOClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                        <Field label="Tenant ID (Directory ID)"      value={oTenantId} onChange={setOTenantId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                        <Field label="Client Secret"                  value={oSecret}   onChange={setOSecret}   placeholder="Paste secret value from Azure" secret />
                        <Field label="Inbox Email"                    value={oEmail}    onChange={setOEmail}    placeholder="crew@yourcompany.com"
                          hint="The shared mailbox or user mailbox to scan for CVs" />
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={saveOutlook}
                            disabled={savingOutlook}
                            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors"
                          >
                            {savingOutlook
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Save className="h-3.5 w-3.5" />}
                            {savingOutlook ? 'Saving & Testing…' : 'Save & Test Connection'}
                          </button>
                          <button
                            onClick={() => setOutlookOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Google Sheet card ── */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50">
                      <Sheet className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Google Sheet — CV Log</h3>
                      <p className="text-xs text-slate-500">
                        {sheetOk
                          ? 'Sheet connected · candidates auto-logged on processing'
                          : 'Paste your Google Sheet URL to auto-log every processed CV'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={sheetOk ? 'success' : 'error'}>
                      {sheetOk
                        ? <><CheckCircle className="h-3 w-3 mr-1" />Connected</>
                        : <><XCircle className="h-3 w-3 mr-1" />Not set</>}
                    </Badge>
                    <button
                      onClick={() => setSheetOpen(o => !o)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {sheetOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {sheetOk ? 'Update' : 'Configure'}
                    </button>
                  </div>
                </div>

                {sheetOk && !sheetOpen && (
                  <div className="px-5 pb-4 space-y-2">
                    <StatusRow label="Sheet URL" value={
                      (data?.sheet?.sheetUrl || '').length > 60
                        ? (data?.sheet?.sheetUrl || '').slice(0, 60) + '…'
                        : (data?.sheet?.sheetUrl || '')
                    } />
                    <button
                      onClick={testSheet}
                      disabled={testingSheet}
                      className="flex items-center gap-1.5 mt-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', testingSheet && 'animate-spin')} />
                      Test Connection
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {sheetOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="p-5 space-y-3 bg-slate-50/50">
                        <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 text-[11px] text-blue-700 space-y-1">
                          <p className="font-bold">One-time setup:</p>
                          <ol className="list-decimal list-inside space-y-0.5">
                            <li>Open your Google Sheet → Share</li>
                            <li>Add <span className="font-mono font-bold">firebase-adminsdk-fbsvc@cv-agent-cfac1.iam.gserviceaccount.com</span> as <strong>Editor</strong></li>
                            <li>Paste the sheet URL below and save</li>
                          </ol>
                        </div>
                        <Field
                          label="Google Sheet URL"
                          value={sheetUrl}
                          onChange={setSheetUrl}
                          placeholder="https://docs.google.com/spreadsheets/d/…"
                          hint="The sheet will be auto-populated with a row for each processed CV"
                        />
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <button
                            onClick={saveSheet}
                            disabled={savingSheet}
                            className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                          >
                            {savingSheet
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Save className="h-3.5 w-3.5" />}
                            {savingSheet ? 'Saving…' : 'Save Sheet URL'}
                          </button>
                          <button
                            onClick={testSheet}
                            disabled={testingSheet || !sheetUrl.trim()}
                            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw className={cn('h-3.5 w-3.5', testingSheet && 'animate-spin')} />
                            {testingSheet ? 'Testing…' : 'Test Connection'}
                          </button>
                          <button
                            onClick={() => setSheetOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── OpenAI card ── */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                      <BrainCircuit className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">OpenAI — CV Analysis</h3>
                      <p className="text-xs text-slate-500">
                        {openaiOk
                          ? `Model: ${(data?.openai ?? data?.gemini)?.model ?? 'gpt-4o-mini'} · Key: ${data?.openai?.keyHint || '••••'}`
                          : 'Enter your OpenAI API key below'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={openaiOk ? 'success' : 'error'}>
                      {openaiOk
                        ? <><CheckCircle className="h-3 w-3 mr-1" />Connected</>
                        : <><XCircle className="h-3 w-3 mr-1" />Not set</>}
                    </Badge>
                    <button
                      onClick={() => setOpenaiOpen(o => !o)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {openaiOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {openaiOk ? 'Update' : 'Configure'}
                    </button>
                  </div>
                </div>

                {openaiOk && !openaiOpen && (
                  <div className="px-5 pb-4 space-y-2">
                    <StatusRow label="Model"  value={(data?.openai ?? data?.gemini)?.model ?? 'gpt-4o-mini'} />
                    <StatusRow label="Key"    value={data?.openai?.keyHint || '••••'} />
                    <StatusRow label="Source" value={data?.openai?.source === 'firestore' ? 'Saved in app' : 'Environment variable'} />
                  </div>
                )}

                <AnimatePresence>
                  {openaiOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="p-5 space-y-3 bg-slate-50/50">
                        <p className="text-xs text-slate-500 mb-1">
                          Get your key from <strong>platform.openai.com → API Keys</strong>
                        </p>
                        <Field
                          label="OpenAI API Key"
                          value={aiKey}
                          onChange={setAiKey}
                          placeholder="sk-proj-..."
                          secret
                        />
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-600">Model</label>
                          <select
                            value={aiModel}
                            onChange={e => setAiModel(e.target.value)}
                            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:outline-none focus:border-primary-400 focus:bg-white transition-all"
                          >
                            <option value="gpt-4o-mini">gpt-4o-mini (recommended — fast & cheap)</option>
                            <option value="gpt-4o">gpt-4o (most accurate)</option>
                            <option value="gpt-3.5-turbo">gpt-3.5-turbo (cheapest)</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={saveOpenAI}
                            disabled={savingOpenAI}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                          >
                            {savingOpenAI
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Save className="h-3.5 w-3.5" />}
                            {savingOpenAI ? 'Saving…' : 'Save API Key'}
                          </button>
                          <button
                            onClick={() => setOpenaiOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {/* ── Test Email Send card ── */}
              {outlookOk && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
                        <Send className="h-4 w-4 text-violet-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Test Email Sending</h3>
                        <p className="text-xs text-slate-500">
                          Send a test email to verify Mail.Send permission is configured
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={testSendEmail}
                        onChange={e => setTestSendEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && testSend()}
                        placeholder="your@email.com"
                        className="flex-1 h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-violet-300 focus:bg-white transition-all"
                      />
                      <button
                        onClick={testSend}
                        disabled={testingSend || !testSendEmail.trim()}
                        className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors shrink-0"
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', testingSend && 'animate-spin')} />
                        {testingSend ? 'Sending…' : 'Send Test'}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      If this fails with &ldquo;Mail.Send permission&rdquo; — go to Azure Portal → App Registrations → your app → API Permissions → Add <strong>Mail.Send</strong> (Application) → Grant admin consent.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}

      {/* ── Usage tab ── */}
      {tab === 'usage' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <TokenUsagePanel />
        </motion.div>
      )}

      {/* ── Email Templates tab ── */}
      {tab === 'templates' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <EmailTemplatesPanel />
        </motion.div>
      )}
    </div>
  );
}
