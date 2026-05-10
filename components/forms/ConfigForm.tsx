'use client';

import { useState, useEffect, useRef } from 'react';
import {
  DragDropContext, Droppable, Draggable, DropResult,
} from '@hello-pangea/dnd';
import {
  Save, CheckCircle2, Anchor, GripVertical, ToggleLeft,
  ToggleRight, Trash2, Plus, X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/utils/api-client';
import { cn } from '@/lib/utils/helpers';
import toast from 'react-hot-toast';
import type { RankConfig, RankRequirement } from '@/types';
import { MARITIME_RANKS } from '@/lib/utils/ranks';

function buildDefaults(): RankRequirement[] {
  return (MARITIME_RANKS as readonly string[]).map((rank, i) => ({ rank, enabled: true, order: i + 1 }));
}

// Re-assign `order` after any reorder / add / delete so it always
// equals the 1-based visual position.
function reindex(list: RankRequirement[]): RankRequirement[] {
  return list.map((r, i) => ({ ...r, order: i + 1 }));
}

// ─── Single rank row ──────────────────────────────────────────
interface RowProps {
  req:       RankRequirement;
  index:     number;
  isDragging: boolean;
  onToggle:  () => void;
  onDelete:  () => void;
}

function RankRow({ req, index, isDragging, onToggle, onDelete }: RowProps) {
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

      {/* Rank name */}
      <span className={cn(
        'flex-1 text-sm font-medium truncate',
        req.enabled ? 'text-slate-900' : 'text-slate-400',
      )}>
        {req.rank}
      </span>

      {/* Enable / disable toggle */}
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

// ─── Add-rank inline form ─────────────────────────────────────
function AddRankRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen]   = useState(false);
  const [name, setName]   = useState('');
  const inputRef          = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  submit();
    if (e.key === 'Escape') { setName(''); setOpen(false); }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs font-semibold text-slate-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/40 transition-all"
      >
        <Plus className="h-4 w-4" /> Add new rank
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
        onKeyDown={handleKey}
        placeholder="Enter rank name…"
        className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      <button onClick={submit} disabled={!name.trim()} className="shrink-0 rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-40">
        Add
      </button>
      <button onClick={() => { setName(''); setOpen(false); }} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-200 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Main ConfigForm ──────────────────────────────────────────
export function ConfigForm() {
  const [ranks,   setRanks]   = useState<RankRequirement[]>(buildDefaults());
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Load saved config from API
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get<{ success: boolean; data: RankConfig | null }>('/api/config');
        if (res.data?.requirements?.length) {
          // Sort by order (legacy data may lack it), assign any missing orders
          const sorted = [...res.data.requirements]
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
          setRanks(reindex(sorted));
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Drag end ────────────────────────────────────────────────
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

  // ── Toggle enable ───────────────────────────────────────────
  function toggleEnabled(idx: number) {
    setRanks(prev => prev.map((r, i) => i === idx ? { ...r, enabled: !r.enabled } : r));
  }

  // ── Delete ──────────────────────────────────────────────────
  function deleteRank(idx: number) {
    setRanks(prev => reindex(prev.filter((_, i) => i !== idx)));
  }

  // ── Add new ─────────────────────────────────────────────────
  function addRank(name: string) {
    setRanks(prev => {
      // Avoid duplicates (case-insensitive)
      if (prev.some(r => r.rank.toLowerCase() === name.toLowerCase())) {
        toast.error(`"${name}" already exists`);
        return prev;
      }
      return reindex([...prev, { rank: name, enabled: true, order: prev.length + 1 }]);
    });
  }

  // ── Bulk toggles ────────────────────────────────────────────
  function enableAll()  { setRanks(prev => prev.map(r => ({ ...r, enabled: true  }))); }
  function disableAll() { setRanks(prev => prev.map(r => ({ ...r, enabled: false }))); }

  // ── Reset to defaults ───────────────────────────────────────
  function resetDefaults() {
    if (!confirm('Reset to the default 23 ranks? Unsaved changes will be lost.')) return;
    setRanks(buildDefaults());
    toast('Reset to defaults');
  }

  // ── Save ────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await apiClient.post('/api/config', { requirements: ranks });
      setSaved(true);
      toast.success('Rank configuration saved!');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = ranks.filter(r => r.enabled).length;

  // ── Loading skeleton ─────────────────────────────────────────
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
    <div className="space-y-5">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
            <Anchor className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Rank Priority Order</h3>
            <p className="text-xs text-slate-500">
              {enabledCount} of {ranks.length} ranks active
            </p>
          </div>
        </div>

        {/* Bulk action buttons */}
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
            onClick={resetDefaults}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            Reset defaults
          </button>
        </div>
      </div>

      {/* ── Hint ── */}
      <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <GripVertical className="h-4 w-4 text-blue-400 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Drag rows</strong> to set priority order (1 = highest). Toggle the switch to enable / disable a rank. Use the <strong>+ Add</strong> button to create custom ranks.
        </p>
      </div>

      {/* ── Column header ── */}
      <div className="grid grid-cols-[20px_28px_1fr_36px_28px] items-center gap-3 px-3 pb-1 border-b border-slate-100">
        <span />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">#</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rank</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Active</span>
        <span />
      </div>

      {/* ── Drag-and-drop list ── */}
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
                    <div
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      {...drag.dragHandleProps}
                    >
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

      {/* ── Add new rank ── */}
      <AddRankRow onAdd={addRank} />

      {/* ── Save bar ── */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100 flex-wrap">
        <p className="text-xs text-slate-400">
          Order and enabled state apply to all future CV processing and filtering.
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
