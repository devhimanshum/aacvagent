'use client';

import { motion } from 'framer-motion';
import {
  Users, Mail, ClipboardList, Activity, Ship, Anchor, Zap,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useStats, useCandidates } from '@/hooks/useCandidates';
import { CandidateCard } from '@/components/candidates/CandidateCard';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useProcessing } from '@/lib/contexts/processing-context';

const pipeline = [
  {
    step: '01', label: 'Fetch Emails',
    desc: 'Outlook inbox scanned for CV attachments automatically',
    icon: Mail, color: '#2563eb',
  },
  {
    step: '02', label: 'Extract Text',
    desc: 'PDF & DOCX files parsed to extract raw CV content',
    icon: Zap, color: '#7c3aed',
  },
  {
    step: '03', label: 'AI Analysis',
    desc: 'OpenAI evaluates ranks, sea service & maritime history',
    icon: Activity, color: '#0891b2',
  },
  {
    step: '04', label: 'Admin Review',
    desc: 'Recruiter selects or rejects pending candidates',
    icon: ClipboardList, color: '#059669',
  },
];

export default function DashboardPage() {
  const { phase, run } = useProcessing();
  const { stats, loading: statsLoading } = useStats();
  const { candidates: recentCandidates, loading: candidatesLoading } = useCandidates();

  const isActive      = phase === 'scanning' || phase === 'processing';
  const recent        = recentCandidates.slice(0, 6);
  const pending       = (stats as Record<string, number>).pending ?? 0;
  const allCandidates = stats.total + pending;
  const selectionRate = stats.total > 0
    ? Math.round((stats.selected / stats.total) * 100)
    : null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Dashboard"
        subtitle="Maritime crew recruitment overview"
        actions={
          <button
            onClick={run}
            disabled={isActive}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg,#1e40af 0%,#2563eb 100%)',
              boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
            }}
          >
            <Zap className={isActive ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
            {isActive ? 'Processing…' : 'AI Process'}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto bg-surface-50">
        <div className="mx-auto max-w-7xl p-6 space-y-6">

          {/* ── Hero banner ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-2xl p-6 text-white"
            style={{ background: 'linear-gradient(135deg, #040e1e 0%, #071730 40%, #0d254a 75%, #163863 100%)' }}
          >
            <div className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
            <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
            <svg className="absolute bottom-0 left-0 w-full opacity-10" viewBox="0 0 1200 60" preserveAspectRatio="none">
              <path d="M0,30 C200,50 400,10 600,30 C800,50 1000,10 1200,30 L1200,60 L0,60 Z" fill="white"/>
            </svg>

            <div className="relative z-10 flex items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Anchor className="h-4 w-4 text-blue-300/70" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
                    Shipivishta Ship Management
                  </span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
                  Maritime CV Platform
                </h2>
                <p className="mt-1 text-sm text-blue-200/60">
                  AI-powered crew recruitment — review pending candidates and manage your maritime talent pool.
                </p>
              </div>
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="hidden md:flex opacity-20"
              >
                <Ship className="h-16 w-16 text-blue-200" />
              </motion.div>
            </div>

            <div className="relative z-10 mt-5 grid grid-cols-3 gap-3">
              {[
                { label: 'Total CVs',      value: statsLoading ? '—' : allCandidates },
                { label: 'Selected',       value: statsLoading ? '—' : stats.selected },
                { label: 'Selection Rate', value: statsLoading ? '—' : selectionRate !== null ? `${selectionRate}%` : '—' },
              ].map(s => (
                <div key={s.label} className="rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[10px] text-blue-300/60 font-medium uppercase tracking-wider">{s.label}</p>
                  <p className="text-xl font-bold text-white mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Pipeline ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card"
          >
            <div className="flex items-center gap-2 mb-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50">
                <Activity className="h-4 w-4 text-primary-600" />
              </div>
              <h2 className="text-sm font-bold text-slate-800">How It Works</h2>
              <span className="ml-auto text-[11px] text-slate-400 font-medium">Automated Pipeline</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {pipeline.map((item, idx) => (
                <div key={item.step} className="relative flex flex-col gap-3 rounded-xl p-4 border border-slate-100 bg-surface-50 overflow-hidden">
                  {idx < pipeline.length - 1 && (
                    <div className="hidden lg:block absolute -right-1.5 top-1/2 -translate-y-1/2 z-10">
                      <div className="h-px w-3 border-t border-dashed border-slate-300" />
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: `${item.color}15` }}>
                      <item.icon className="h-4 w-4" style={{ color: item.color }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 tracking-widest">STEP {item.step}</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">{item.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Recent candidates ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800">Recent Candidates</h2>
              {!candidatesLoading && recent.length > 0 && (
                <span className="text-[11px] text-slate-400 font-medium">{recent.length} shown</span>
              )}
            </div>

            {candidatesLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array(6).fill(0).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : recent.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((c, i) => (
                  <CandidateCard key={c.id} candidate={c} index={i} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #f0f6ff, #e8eef6)' }}>
                  <Users className="h-8 w-8 text-primary-300" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No candidates yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Configure Outlook & OpenAI in Settings — AI processing runs automatically on each login.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
