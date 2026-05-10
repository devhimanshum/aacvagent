'use client';

import { useState, useEffect, useRef } from 'react';
import {
  DragDropContext, Droppable, Draggable, DropResult,
} from '@hello-pangea/dnd';
import {
  Save, CheckCircle2, Anchor, GripVertical, ToggleLeft,
  ToggleRight, Trash2, Plus, X, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { RankConfig, RankRequirement } from '@/types';
import { MARITIME_RANKS, RANK_ALIASES, normalizeRank } from '@/lib/utils/ranks';

// ── Helpers ───────────────────────────────────────────────────

function buildDefaults(): RankRequirement[] {
  return (MARITIME_RANKS as readonly string[]).map((rank, i) => ({
    rank, enabled: true, order: i + 1,
  }));
}

function reindex(list: RankRequirement[]): RankRequirement[] {
  return list.map((r, i) => ({ ...r, order: i + 1 }));
}

/** Return display-friendly synonyms for a rank (title-cased, max 5 shown) */
function getRankSynonyms(rank: string): string[] {
  const key = normalizeRank(rank);
  const aliases = RANK_ALIASES[key] ?? [];
  return aliases
    .slice(0, 6)
    .map(a => a.replace(/\b\w/g, c => c.toUpperCase()));
}

/** True if the stored rank list is different from the new standard 28 */
function isOutdated(stored: RankRequirement[]): boolean {
  const storedNames = stored.map(r => normalizeRank(r.rank)).sort().join('|');
  const stdNames    = (MARITIME_RANKS as readonly string[]).map(normalizeRank).sort().join('|');
  return storedNames !== stdNames;
}

// ── Rank row ─────────────────────────────────────────────────
interface RowProps {
  req:       RankRequirement;
  index:     number;
  isDragging: boolean;
  onToggle:  () => void;
  onDelete:  () => void;
}

function RankRow({ req, index, isDragging, onToggle, onDelete }: RowProps) {
  const synonyms = getRankSynonyms(req.rank);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-150 select-none',
        isDragging
          ? 'border-primary-400 bg-primary-50 shadow-lg ring-1 ring-primary-300 rotate-[0.5deg]'
          : req.enabled
            ? 'border-slate-200 bg-white hover:border-primary-200 hover:bg-primary-50/30'
            : 'border-slate-100 bg-slate-50/60 opacity-50',
      )}
    >
      {/* Drag handle */}
      <div className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-400 transition-colors">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Order badge */}
      <span className={cn(
        'shrink-0 flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold',
        req.enabled ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-400',
      )}>
        {index + 1}
      </span>

      {/* Rank name + synonyms */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-semibold leading-tight truncate',
          req.enabled ? 'text-slate-900' : 'text-slate-400',
        )}>
          {req.rank}
        </p>
        {synonyms.length > 0 && (
          <p className={cn(
            'text-[10px] leading-snug mt-0.5 truncate',
            req.enabled ? 'text-slate-400' : 'text-slate-300',
          )}>
            {synonyms.join(' · ')}
          </p>
        )}
      </div>

      {/* Toggle */}
      <button
        onClick={onToggle}
        title={req.enabled ? 'Disable' : 'Enable'}
        className="shrink-0 transition-transform hover:scale-110"
      >
        {req.enabled
          ? <ToggleRight className="h-6 w-6 text-primary-500" />
          : <ToggleLeft  className="h-6 w-6 text-slate-300"   />
        }
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        title="Remove rank"
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-1 text-slate-300 hover:text-red-500 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Add-rank form ─────────────────────────────────────────────
function AddRankRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const inputRef        = useRef<HTMLInputElement>(null);

  function submit() {
    const t = name.trim();
    if (!t) return;
    onAdd(t);
    setName('');
    setOpen(false);
  }

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs font-semibold text-slate-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/40 transition-all"
      >
        <Plus className="h-4 w-4" /> Add custom rank
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary-300 bg-primary-50/40 px-3 py-2.5">
      <Plus className="h-4 w-4 shrink-0 text-primary-500" />
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setName(''); setOpen(false); } }}
        placeholder="Enter rank name…"
        className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      <button onClick={submit} disabled={!name.trim()} className="shrink-0 rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-40 transition-colors">
        Add
      </button>
      <button onClick={() => { setName(''); setOpen(false); }} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-200 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export function ConfigForm() {
  const [ranks,      setRanks]      = useState<RankRequirement[]>(buildDefaults());
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [outdated,   setOutdated]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get<{ success: boolean; data: RankConfig | null }>('/api/config');
        if (res.data?.requirements?.length) {
          const sorted = [...res.data.requirements].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
          setRanks(reindex(sorted));
          setOutdated(isOutdated(sorted));
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, []);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const src = result.source.index;
    const dst = result.destination.index;
    if (src === dst) return;
    setRanks(prev => {
      const next = [...prev];
      const [moved] = next.splice(src, 1);
      next.splice(dst, 0, moved);
      return reindex(next);
    });
  }

  function toggleEnabled(idx: number) {
    setRanks(prev => prev.map((r, i) => i === idx ? { ...r, enabled: !r.enabled } : r));
  }

  function deleteRank(idx: number) {
    setRanks(prev => reindex(prev.filter((_, i) => i !== idx)));
  }

  function addRank(name: string) {
    setRanks(prev => {
      if (prev.some(r => r.rank.toLowerCase() === name.toLowerCase())) {
        toast.error(`"${name}" already exists`);
        return prev;
      }
      return reindex([...prev, { rank: name, enabled: true, order: prev.length + 1 }]);
    });
  }

  function enableAll()  { setRanks(prev => prev.map(r => ({ ...r, enabled: true  }))); }
  function disableAll() { setRanks(prev => prev.map(r => ({ ...r, enabled: false }))); }

  /** Replace the current list with the new 28 standard ranks */
  function applyStandard() {
    setRanks(buildDefaults());
    setOutdated(false);
    toast('Standard 28 ranks applied — click Save to confirm');
  }

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await apiClient.post('/api/config', { requirements: ranks });
      setSaved(true);
      setOutdated(false);
      toast.success('Rank configuration saved!');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = ranks.filter(r => r.enabled).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array(8).fill(0).map((_, i) => (
          <div key={i} className="h-11 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">

        {/* Outdated rank notice */}
        {outdated && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Old rank list detected</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Your saved config uses the previous rank names. Click <strong>Apply Standard Ranks</strong> to replace them with the new 28-rank system, then save.
              </p>
            </div>
            <button
              onClick={applyStandard}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Apply Standard Ranks
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
              <Anchor className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Rank Priority Order</h3>
              <p className="text-xs text-slate-500">
                {enabledCount} of {ranks.length} ranks active — drag to reorder
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={enableAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Enable all
            </button>
            <button
              onClick={disableAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Disable all
            </button>
            <button
              onClick={applyStandard}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-50 border border-primary-200 text-primary-700 hover:bg-primary-100 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Reset to standard 28
            </button>
          </div>
        </div>

        {/* Hint */}
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
          <GripVertical className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong>Drag rows</strong> to set priority (1 = highest). Toggle the switch to enable / disable a rank. Synonyms are resolved automatically — "2E", "2/E", "2nd Engineer" all match <strong>Second Engineer</strong>.
          </p>
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[20px_28px_1fr_36px_28px] items-center gap-3 px-3 pb-1 border-b border-slate-100">
          <span />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">#</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rank</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Active</span>
          <span />
        </div>

        {/* DnD list */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="ranks">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  'space-y-2 rounded-2xl transition-all duration-200',
                  snapshot.isDraggingOver && 'bg-slate-50/80',
                )}
              >
                {ranks.map((req, index) => (
                  <Draggable key={req.rank} draggableId={req.rank} index={index}>
                    {(drag, snap) => (
                      <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}>
                        <RankRow
                          req={req}
                          index={index}
                          isDragging={snap.isDragging}
                          onToggle={() => toggleEnabled(index)}
                          onDelete={() => deleteRank(index)}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <AddRankRow onAdd={addRank} />

      {/* Save bar */}
      <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100 flex-wrap">
        <p className="text-xs text-slate-400">
          Order and active state apply to all future CV processing and filtering.
        </p>
        <Button
          onClick={handleSave}
          loading={saving}
          icon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        >
          {saved ? 'Saved!' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
