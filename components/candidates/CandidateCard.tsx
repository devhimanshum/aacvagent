'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Anchor, Clock, BookOpen,
  ChevronDown, ChevronUp,
  ClipboardList, Zap, FileText, ShieldCheck, Ship,
} from 'lucide-react';
import { CVPreviewButton } from '@/components/ui/CVPreviewButton';
import { Badge } from '@/components/ui/Badge';
import { ContactRow } from '@/components/ui/ContactLink';
import { cn, formatDate } from '@/lib/utils/helpers';
import type { Candidate, MaritimeDocuments, RankEntry, RankRequirement } from '@/types';

// ── Avatar ────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',     'from-indigo-500 to-blue-600',
];
const getColor    = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';

// ── Duration label ────────────────────────────────────────────
export function monthsLabel(m: number) {
  if (!m) return '—';
  const y = Math.floor(m / 12), mo = m % 12;
  return [y ? `${y}yr` : '', mo ? `${mo}mo` : ''].filter(Boolean).join(' ');
}

// ── Aggregate rank history → { rank → totalMonths } ──────────
// Merges duplicate ranks (multiple contracts at same rank).
export function aggregateRanks(history: RankEntry[]): { rank: string; totalMonths: number; isPresentRole: boolean }[] {
  const map = new Map<string, { totalMonths: number; isPresentRole: boolean }>();
  for (const entry of history) {
    const key = (entry.rank || '').trim();
    if (!key) continue;
    const existing = map.get(key);
    map.set(key, {
      totalMonths:   (existing?.totalMonths   ?? 0) + (entry.durationMonths ?? 0),
      isPresentRole: (existing?.isPresentRole ?? false) || !!entry.isPresentRole,
    });
  }
  // Sort: current role first, then by total months desc
  return Array.from(map.entries())
    .map(([rank, v]) => ({ rank, ...v }))
    .sort((a, b) => {
      if (a.isPresentRole && !b.isPresentRole) return -1;
      if (!a.isPresentRole && b.isPresentRole) return  1;
      return b.totalMonths - a.totalMonths;
    });
}

// ── Rank-config-ordered experience list ───────────────────────
// If rankConfig is provided, show ranks in config priority order.
function orderedRankExp(
  history: RankEntry[],
  rankConfig?: RankRequirement[],
): { rank: string; totalMonths: number; isPresentRole: boolean; inConfig: boolean }[] {
  const aggregated = aggregateRanks(history);

  if (!rankConfig?.length) {
    return aggregated.map(r => ({ ...r, inConfig: false }));
  }

  const configRanks = rankConfig.filter(r => r.enabled).sort((a, b) => a.order - b.order);

  // Match aggregated entry to config rank (case-insensitive partial)
  function matchConfig(rank: string) {
    const r = rank.toLowerCase();
    return configRanks.find(c => {
      const cr = c.rank.toLowerCase();
      return r === cr || r.includes(cr) || cr.includes(r);
    });
  }

  const result: { rank: string; totalMonths: number; isPresentRole: boolean; inConfig: boolean; order: number }[] = [];
  const usedRanks = new Set<string>();

  for (const agg of aggregated) {
    const match = matchConfig(agg.rank);
    result.push({ ...agg, inConfig: !!match, order: match?.order ?? 9999 });
    usedRanks.add(agg.rank);
  }

  return result.sort((a, b) => {
    if (a.isPresentRole && !b.isPresentRole) return -1;
    if (!a.isPresentRole && b.isPresentRole)  return  1;
    if (a.inConfig && !b.inConfig) return -1;
    if (!a.inConfig && b.inConfig)  return  1;
    if (a.order !== b.order) return a.order - b.order;
    return b.totalMonths - a.totalMonths;
  });
}

// ── Aggregate vessel types from rank history ──────────────────
export function aggregateVesselTypes(
  history: RankEntry[],
): { vesselType: string; totalMonths: number }[] {
  const map = new Map<string, number>();
  for (const e of history) {
    const vt = (e.vesselType || '').trim();
    if (!vt) continue;
    map.set(vt, (map.get(vt) ?? 0) + (e.durationMonths ?? 0));
  }
  return Array.from(map.entries())
    .map(([vesselType, totalMonths]) => ({ vesselType, totalMonths }))
    .sort((a, b) => b.totalMonths - a.totalMonths);
}

// ── Vessel type color chips ───────────────────────────────────
const VESSEL_COLORS: Record<string, string> = {
  'bulk carrier':           'bg-amber-50 text-amber-700 border-amber-200',
  'oil tanker':             'bg-rose-50 text-rose-700 border-rose-200',
  'chemical tanker':        'bg-purple-50 text-purple-700 border-purple-200',
  'product tanker':         'bg-orange-50 text-orange-700 border-orange-200',
  'vlcc':                   'bg-red-50 text-red-700 border-red-200',
  'ulcc':                   'bg-red-50 text-red-800 border-red-200',
  'lng carrier':            'bg-sky-50 text-sky-700 border-sky-200',
  'lpg carrier':            'bg-cyan-50 text-cyan-700 border-cyan-200',
  'container ship':         'bg-indigo-50 text-indigo-700 border-indigo-200',
  'container':              'bg-indigo-50 text-indigo-700 border-indigo-200',
  'general cargo':          'bg-teal-50 text-teal-700 border-teal-200',
  'ro-ro':                  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'car carrier':            'bg-green-50 text-green-700 border-green-200',
  'passenger':              'bg-pink-50 text-pink-700 border-pink-200',
  'offshore supply vessel': 'bg-blue-50 text-blue-700 border-blue-200',
  'osv':                    'bg-blue-50 text-blue-700 border-blue-200',
  'ahts':                   'bg-blue-50 text-blue-800 border-blue-200',
  'psv':                    'bg-blue-50 text-blue-600 border-blue-200',
  'dredger':                'bg-stone-50 text-stone-700 border-stone-200',
  'reefer':                 'bg-lime-50 text-lime-700 border-lime-200',
};

function vesselTypeColor(vt: string): string {
  return VESSEL_COLORS[vt.toLowerCase()] ?? 'bg-slate-50 text-slate-600 border-slate-200';
}

// ── Vessel type summary section ───────────────────────────────
function VesselTypeSection({ history }: { history: RankEntry[] }) {
  const types = aggregateVesselTypes(history);
  if (types.length === 0) return null;
  return (
    <div className="pt-1 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
        <Ship className="h-3 w-3" /> Vessel Types
      </p>
      <div className="flex flex-wrap gap-1.5">
        {types.map(({ vesselType, totalMonths }) => (
          <span
            key={vesselType}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
              vesselTypeColor(vesselType),
            )}
            title={`${monthsLabel(totalMonths)} on ${vesselType}`}
          >
            {vesselType}
            {totalMonths > 0 && (
              <span className="opacity-60 text-[10px] font-medium">{monthsLabel(totalMonths)}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Rank experience bar ───────────────────────────────────────
function RankExpBar({ rank, totalMonths, isPresentRole, maxMonths }: {
  rank: string; totalMonths: number; isPresentRole: boolean; maxMonths: number;
}) {
  const pct = maxMonths > 0 ? Math.min(100, (totalMonths / maxMonths) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 w-[130px] shrink-0">
        {isPresentRole && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
        <span className={cn('text-xs truncate', isPresentRole ? 'font-bold text-emerald-800' : 'font-medium text-slate-700')}>
          {rank}
        </span>
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', isPresentRole ? 'bg-emerald-400' : 'bg-primary-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[11px] text-slate-500 w-14 text-right">{monthsLabel(totalMonths)}</span>
    </div>
  );
}

// ── Full rank history row ─────────────────────────────────────
function RankHistoryRow({ entry }: { entry: RankEntry }) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl border px-3 py-2 text-xs',
      entry.isPresentRole ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/50',
    )}>
      <div className={cn('mt-1 h-2 w-2 rounded-full shrink-0', entry.isPresentRole ? 'bg-emerald-500' : 'bg-slate-300')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={cn('font-semibold truncate', entry.isPresentRole ? 'text-emerald-800' : 'text-slate-800')}>
            {entry.rank || 'Unknown'}
          </span>
          {entry.durationMonths ? (
            <span className="flex items-center gap-1 text-slate-400 shrink-0">
              <Clock className="h-3 w-3" />{monthsLabel(entry.durationMonths)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {entry.vessel  && <span className="flex items-center gap-1 text-slate-500"><Anchor className="h-3 w-3 text-slate-300" />{entry.vessel}</span>}
          {entry.vesselType && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-semibold',
              vesselTypeColor(entry.vesselType),
            )}>
              <Ship className="h-2.5 w-2.5" />{entry.vesselType}
            </span>
          )}
          {entry.company && <span className="text-slate-400">{entry.company}</span>}
          {(entry.from || entry.to) && (
            <span className="text-slate-400">{entry.from}{entry.from && entry.to ? ' – ' : ''}{entry.to}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Documents section (Passport / CDC / COC / COP) ───────────
const DOC_LABELS: Record<string, string> = {
  passport: 'Passport',
  cdc:      'CDC',
  coc:      'COC',
  cop:      'COP',
};

function DocumentsSection({ documents }: { documents: MaritimeDocuments }) {
  const entries = Object.entries(documents) as [keyof MaritimeDocuments, NonNullable<MaritimeDocuments[keyof MaritimeDocuments]>][];
  if (entries.length === 0) return null;

  return (
    <div className="pt-2 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
        <ShieldCheck className="h-3 w-3" /> Documents
      </p>
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-4 px-3 py-1.5 bg-slate-100/70">
          {['Document', 'Number', 'Issue Date', 'Expiry / Place'].map(h => (
            <span key={h} className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{h}</span>
          ))}
        </div>
        {entries.map(([key, doc]) => (
          <div key={key} className="grid grid-cols-4 px-3 py-2 items-center">
            <span className="text-[11px] font-bold text-slate-700">{DOC_LABELS[key] ?? key.toUpperCase()}</span>
            <span className="text-[11px] font-mono text-slate-600">{doc.number || '—'}</span>
            <span className="text-[11px] text-slate-500">{doc.issueDate || '—'}</span>
            <div>
              <span className={cn(
                'text-[11px] block font-medium',
                doc.expiryDate === 'LIFE TIME' || doc.expiryDate === 'N/A'
                  ? 'text-emerald-600'
                  : 'text-slate-600',
              )}>
                {doc.expiryDate || '—'}
              </span>
              {doc.placeOfIssue && (
                <span className="text-[10px] text-slate-400">{doc.placeOfIssue}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
interface CandidateCardProps {
  candidate:  Candidate;
  index?:     number;
  rankConfig?: RankRequirement[];  // pass from review board for ordered display
}

export function CandidateCard({ candidate, index = 0, rankConfig }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const history     = candidate.rankHistory ?? [];
  const rankExp     = orderedRankExp(history, rankConfig);
  const maxMonths   = Math.max(...rankExp.map(r => r.totalMonths), 1);
  const topExp      = rankExp.slice(0, 4);
  const hiddenCount = rankExp.length - topExp.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className={cn(
        'rounded-2xl border bg-white overflow-hidden transition-shadow hover:shadow-md',
        candidate.duplicate ? 'border-amber-200' : 'border-slate-200',
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <div className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          'bg-gradient-to-br text-white text-sm font-bold shadow-sm',
          getColor(candidate.name),
        )}>
          {getInitials(candidate.name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">{candidate.name || 'Unknown'}</p>
              {candidate.currentRank && (
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2 py-0.5">
                  <Anchor className="h-2.5 w-2.5" />{candidate.currentRank}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {candidate.rankMatched !== undefined && (
                <span className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border',
                  candidate.rankMatched
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200',
                )}>
                  <Zap className="h-2.5 w-2.5" />
                  {candidate.rankMatched ? `${candidate.rankMatchScore ?? 0}%` : 'No match'}
                </span>
              )}
              <Badge variant={candidate.reviewStatus === 'selected' ? 'success' : 'error'}>
                {candidate.reviewStatus === 'selected' ? 'Onboard' : candidate.reviewStatus}
              </Badge>
            </div>
          </div>

          {/* Contact */}
          <ContactRow
            email={candidate.email}
            phones={candidate.phones?.length ? candidate.phones : candidate.phone ? [candidate.phone] : []}
            size="xs"
            truncate
            className="mt-2"
          />
        </div>
      </div>

      {/* ── Total sea service + rank experience ── */}
      <div className="px-5 pb-3 space-y-2">
        {candidate.totalSeaServiceMonths > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            Total sea service:
            <span className="font-bold text-slate-900">{monthsLabel(candidate.totalSeaServiceMonths)}</span>
          </div>
        )}

        {/* Per-rank experience bars */}
        {topExp.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {topExp.map(r => (
              <RankExpBar
                key={r.rank}
                rank={r.rank}
                totalMonths={r.totalMonths}
                isPresentRole={r.isPresentRole}
                maxMonths={maxMonths}
              />
            ))}
            {hiddenCount > 0 && !expanded && (
              <p className="text-[11px] text-slate-400 pl-1">+{hiddenCount} more rank{hiddenCount > 1 ? 's' : ''}…</p>
            )}
          </div>
        )}

        {/* Vessel types — always visible summary chips */}
        <VesselTypeSection history={history} />
      </div>

      {/* ── Expanded detail ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="px-5 py-4 space-y-2">
              {/* Remaining rank-exp bars */}
              {rankExp.slice(4).map(r => (
                <RankExpBar key={r.rank} rank={r.rank} totalMonths={r.totalMonths} isPresentRole={r.isPresentRole} maxMonths={maxMonths} />
              ))}

              {/* Full raw history */}
              {history.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <ClipboardList className="h-3 w-3" /> Full History ({history.length} entries)
                  </p>
                  {history.map((e, i) => <RankHistoryRow key={i} entry={e} />)}
                </div>
              )}

              {/* Summary */}
              {candidate.summary && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">AI Summary</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{candidate.summary}</p>
                </div>
              )}

              {/* Education */}
              {candidate.education && candidate.education !== 'Not specified' && (
                <div className="flex items-start gap-2 pt-1">
                  <BookOpen className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600">{candidate.education}</p>
                </div>
              )}

              {/* Documents */}
              {candidate.documents && Object.keys(candidate.documents).length > 0 && (
                <DocumentsSection documents={candidate.documents} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5">
        <p className="text-[11px] text-slate-400">{formatDate(candidate.processedAt || candidate.createdAt)}</p>
        <div className="flex items-center gap-2">
          {candidate.cvAttachmentId && candidate.emailId ? (
            <CVPreviewButton
              emailId={candidate.emailId}
              attachmentId={candidate.cvAttachmentId}
              fileName={candidate.cvFileName || 'CV'}
              variant="ghost"
            />
          ) : (
            <span
              className="flex items-center gap-1 text-[11px] text-slate-300 cursor-default select-none"
              title={
                !candidate.emailId && !candidate.cvAttachmentId
                  ? 'CV was uploaded directly — no email attachment stored'
                  : !candidate.emailId
                    ? 'Email ID missing — CV source email not recorded'
                    : 'Attachment ID missing — CV file reference not saved'
              }
            >
              <FileText className="h-3.5 w-3.5" />
              No CV file
            </span>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Less' : 'Details'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
