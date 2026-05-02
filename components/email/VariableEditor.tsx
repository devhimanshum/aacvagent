'use client';

/**
 * VariableEditor — a textarea that highlights {{variables}} inline
 * and provides one-click variable insertion chips.
 *
 * Technique: a position-absolute backdrop div mirrors the textarea content,
 * wrapping {{vars}} in <mark> elements with colored backgrounds.
 * The textarea floats above it with bg-transparent so the highlights show through.
 */

import { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils/helpers';

// ── Variable definitions ──────────────────────────────────────
export const VARS = [
  {
    tag:        '{{name}}',
    label:      'Full Name',
    chipColor:  'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200',
    markStyle:  'background:#bfdbfe;border-radius:3px;color:transparent',
  },
  {
    tag:        '{{firstName}}',
    label:      'First Name',
    chipColor:  'bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200',
    markStyle:  'background:#ddd6fe;border-radius:3px;color:transparent',
  },
  {
    tag:        '{{rank}}',
    label:      'Rank',
    chipColor:  'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200',
    markStyle:  'background:#a7f3d0;border-radius:3px;color:transparent',
  },
] as const;

// ── Build backdrop HTML with highlighted vars ─────────────────
function buildHighlightHtml(text: string): string {
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  for (const v of VARS) {
    const escaped = v.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    safe = safe.replace(
      new RegExp(escaped, 'gi'),
      `<mark style="${v.markStyle}">${v.tag}</mark>`,
    );
  }

  // Preserve newlines for the backdrop div (pre-wrap already handles this,
  // but we need a trailing newline so the last empty line has height)
  return safe + '\n';
}

// ── Shared padding / font constants ──────────────────────────
// Must match exactly between backdrop and textarea
const SHARED_STYLE: React.CSSProperties = {
  fontFamily:   'inherit',
  fontSize:     '0.875rem',   // text-sm
  lineHeight:   '1.625',      // leading-relaxed
  padding:      '10px 12px',
  letterSpacing: 'normal',
  wordBreak:    'break-word',
  overflowWrap: 'break-word',
  whiteSpace:   'pre-wrap',
  tabSize:      4,
};

// ── Variable chip bar ─────────────────────────────────────────
interface ChipBarProps {
  onInsert: (tag: string) => void;
  disabled?: boolean;
  label?: string;
}

export function VariableChipBar({ onInsert, disabled, label = 'Insert variable:' }: ChipBarProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">
        {label}
      </span>
      {VARS.map(v => (
        <button
          key={v.tag}
          type="button"
          disabled={disabled}
          onClick={() => onInsert(v.tag)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] font-bold font-mono transition-all select-none',
            v.chipColor,
            disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
          )}
        >
          {v.tag}
        </button>
      ))}
    </div>
  );
}

// ── VariableInput (single-line, for Subject) ──────────────────
interface VariableInputProps {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  disabled?:    boolean;
  className?:   string;
}

export function VariableInput({ value, onChange, placeholder, disabled, className }: VariableInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  const insert = useCallback((tag: string) => {
    const el = ref.current;
    if (!el) { onChange(value + tag); return; }
    const s   = el.selectionStart ?? value.length;
    const e   = el.selectionEnd   ?? value.length;
    const next = value.slice(0, s) + tag + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = s + tag.length;
      el.selectionEnd   = s + tag.length;
    });
  }, [value, onChange]);

  return (
    <div className="space-y-2">
      <VariableChipBar onInsert={insert} disabled={disabled} />
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800',
          'placeholder:text-slate-300 focus:outline-none focus:border-primary-300 focus:bg-white',
          'transition-all disabled:opacity-60',
          className,
        )}
      />
    </div>
  );
}

// ── VariableEditor (multi-line, with highlight overlay) ───────
interface VariableEditorProps {
  value:        string;
  onChange:     (v: string) => void;
  rows?:        number;
  placeholder?: string;
  disabled?:    boolean;
  className?:   string;
}

export function VariableEditor({
  value, onChange, rows = 9, placeholder, disabled, className,
}: VariableEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const bdRef = useRef<HTMLDivElement>(null);

  // Keep backdrop scroll in sync with textarea scroll
  const syncScroll = useCallback(() => {
    if (bdRef.current && taRef.current) {
      bdRef.current.scrollTop  = taRef.current.scrollTop;
      bdRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }, []);

  const insert = useCallback((tag: string) => {
    const ta = taRef.current;
    if (!ta) { onChange(value + tag); return; }
    const s    = ta.selectionStart ?? value.length;
    const e    = ta.selectionEnd   ?? value.length;
    const next = value.slice(0, s) + tag + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + tag.length;
      ta.selectionEnd   = s + tag.length;
    });
  }, [value, onChange]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Chip bar */}
      <VariableChipBar onInsert={insert} disabled={disabled} />

      {/* Editor container */}
      <div
        className={cn(
          'relative rounded-xl border border-slate-200 bg-white overflow-hidden',
          'focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100',
          'transition-all',
        )}
      >
        {/* ── Highlight backdrop ── */}
        <div
          ref={bdRef}
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden pointer-events-none select-none"
          style={SHARED_STYLE}
          dangerouslySetInnerHTML={{ __html: buildHighlightHtml(value) }}
        />

        {/* ── Actual textarea (floats above backdrop) ── */}
        <textarea
          ref={taRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'relative z-10 w-full bg-transparent resize-none',
            'text-slate-800 placeholder:text-slate-300',
            'focus:outline-none disabled:opacity-60',
          )}
          style={{ ...SHARED_STYLE, caretColor: '#1e293b' }}
          spellCheck={false}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap">
        {VARS.map(v => (
          <span key={v.tag} className="flex items-center gap-1 text-[11px] text-slate-400">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: v.markStyle.match(/background:([^;]+)/)?.[1] }}
            />
            {v.tag}
          </span>
        ))}
        <span className="text-[11px] text-slate-300">— highlighted above</span>
      </div>
    </div>
  );
}
