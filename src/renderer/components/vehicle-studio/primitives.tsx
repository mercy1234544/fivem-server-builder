// Shared Vehicle Studio tuning UI primitives — one visual language for every
// category, the Handling editor, Smart Tune, Presets and Changes.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info, RotateCcw, AlertTriangle, ChevronRight, CheckCircle2, Loader2, X,
  Copy, ClipboardPaste, HelpCircle,
} from 'lucide-react';
import {
  FIELD_META, fieldLabel, fieldWarning, decimalsOf, isIntField, type Health,
} from '../../../main/shared/handlingMeta';

// ── "Why?" explanation popover (what / higher / lower / extreme) ──────────────
export function WhyTip({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const tip = FIELD_META[name]?.tip;
  if (!tip) return null;
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        title="Why?" className="text-surface-600 hover:text-primary-300 transition-colors">
        <HelpCircle size={11} />
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-5 w-64 rounded-lg border border-overlay-6 bg-surface-900 shadow-xl p-3 text-left">
          <p className="text-[11px] font-bold text-surface-100 mb-1">{fieldLabel(name)}</p>
          <p className="text-[11px] text-surface-300"><span className="text-surface-500">What it does: </span>{tip.what}</p>
          {tip.higher && <p className="text-[11px] text-surface-300 mt-1"><span className="text-emerald-400">Higher: </span>{tip.higher}</p>}
          {tip.lower && <p className="text-[11px] text-surface-300 mt-0.5"><span className="text-sky-400">Lower: </span>{tip.lower}</p>}
          {tip.extreme && <p className="text-[11px] text-amber-300/90 mt-1"><span className="text-amber-400">Too extreme: </span>{tip.extreme}</p>}
        </div>
      )}
    </span>
  );
}

// ── Extreme / out-of-range value badge ───────────────────────────────────────
export function WarnBadge({ name, value }: { name: string; value: string }) {
  const w = fieldWarning(name, parseFloat(value));
  if (w.level === 'ok') return null;
  const c = w.level === 'extreme' ? 'text-red-400' : 'text-amber-400';
  return <span title={w.message} className={`inline-flex ${c}`}><AlertTriangle size={11} /></span>;
}

// ── Health pill (Configuration Health — not a physics measurement) ───────────
const HEALTH_STYLE: Record<Health, string> = {
  good: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  extreme: 'bg-red-500/15 text-red-300 border-red-500/25',
};
const HEALTH_LABEL: Record<Health, string> = { good: 'Good', warning: 'Warning', extreme: 'Extreme' };
export function HealthBadge({ health, title }: { health: Health; title?: string }) {
  return <span title={title} className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${HEALTH_STYLE[health]}`}>{HEALTH_LABEL[health]}</span>;
}

// ── One unified field row: label + why + input + modified + was + reset + warn ─
export function TuningField({
  name, value, original, isDirty, isModified, onChange, onResetToOriginal,
  onCopy, onPaste, canPaste,
}: {
  name: string; value: string; original?: string; isDirty: boolean; isModified: boolean;
  onChange: (v: string) => void; onResetToOriginal: () => void;
  onCopy?: () => void; onPaste?: () => void; canPaste?: boolean;
}) {
  const meta = FIELD_META[name];
  const range = meta?.safeMin !== undefined && meta?.safeMax !== undefined ? `${meta.safeMin}–${meta.safeMax}` : null;
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs text-surface-200 flex-1 min-w-0 flex items-center gap-1 truncate">
          <span className="truncate">{fieldLabel(name)}</span>
          <WhyTip name={name} />
          {isModified && <span title="Changed from imported value" className="inline-block w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />}
        </label>
        <WarnBadge name={name} value={value} />
        <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false}
          className={`w-24 bg-overlay-3 border rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none ${isDirty ? 'border-primary-500/50 text-primary-200' : isModified ? 'border-amber-500/30 text-surface-100' : 'border-overlay-6 text-surface-200'}`} />
        {onCopy && <button onClick={onCopy} title="Copy value" className="text-surface-600 hover:text-surface-200"><Copy size={11} /></button>}
        {onPaste && <button onClick={onPaste} disabled={!canPaste} title="Paste value" className={`text-surface-600 hover:text-surface-200 ${!canPaste ? 'opacity-30' : ''}`}><ClipboardPaste size={11} /></button>}
        <button onClick={onResetToOriginal} disabled={!isModified && !isDirty} title={original !== undefined ? `Reset to original (${original})` : 'Reset to original'}
          className={`text-surface-500 hover:text-surface-100 ${!isModified && !isDirty ? 'opacity-30' : ''}`}><RotateCcw size={12} /></button>
      </div>
      <div className="flex items-center gap-2 mt-0.5 pl-0.5">
        <p className="text-[10px] text-surface-600 font-mono shrink-0">{name}</p>
        {isModified && original !== undefined && <p className="text-[10px] text-amber-400/80 shrink-0">was {original}</p>}
        {range && <p className="text-[10px] text-surface-600 shrink-0">· typical {range}{meta?.unit ? ` ${meta.unit}` : ''}</p>}
      </div>
    </div>
  );
}

// ── Before → after row (used in preview modals & changes) ────────────────────
export function BeforeAfterRow({ name, from, to, tone = 'emerald' }: { name: string; from: string; to: string; tone?: 'emerald' | 'sky' }) {
  const toClass = tone === 'sky' ? 'text-sky-300' : 'text-emerald-300';
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs">
      <span className="text-surface-300 flex-1 truncate" title={name}>{fieldLabel(name)}</span>
      <span className="font-mono text-surface-500">{Number.isFinite(parseFloat(from)) ? parseFloat(from) : from}</span>
      <ChevronRight size={11} className="text-surface-600 shrink-0" />
      <span className={`font-mono font-semibold ${toClass}`}>{Number.isFinite(parseFloat(to)) ? parseFloat(to) : to}</span>
    </div>
  );
}

// ── Preset / Smart Tune preview modal (fields changed, majors, warnings) ─────
export interface PreviewChange { name: string; from: string; to: string }
export function PresetPreviewModal({
  title, subtitle, changes, warnings, busy, onApply, onCancel, applyLabel = 'Apply',
}: {
  title: string; subtitle?: string; changes: PreviewChange[]; warnings?: string[];
  busy?: boolean; onApply: () => void; onCancel: () => void; applyLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancel}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-surface-100">{title}</p>
          <button onClick={onCancel} className="text-surface-500 hover:text-surface-200"><X size={16} /></button>
        </div>
        {subtitle && <p className="text-[11px] text-surface-500 mb-2">{subtitle}</p>}
        <p className="text-xs text-surface-400 mb-2">{changes.length === 0 ? 'No changes — already matches.' : `${changes.length} field${changes.length === 1 ? '' : 's'} will change`}</p>
        {warnings && warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 mb-2 space-y-1">
            {warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-300 flex items-start gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {w}</p>)}
          </div>
        )}
        <div className="flex-1 overflow-y-auto rounded-lg border border-overlay-4 bg-overlay-2 divide-y divide-overlay-4 mb-3">
          {changes.map((c) => <BeforeAfterRow key={c.name} name={c.name} from={c.from} to={c.to} />)}
          {changes.length === 0 && <p className="text-xs text-surface-500 p-3">Nothing to apply.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary text-xs py-1.5">Cancel</button>
          <button onClick={onApply} disabled={busy || changes.length === 0} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {applyLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Preset card (name + description) ─────────────────────────────────────────
export function PresetCard({ name, desc, active, onClick }: { name: string; desc?: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-xl border p-2.5 transition-all ${active ? 'border-primary-500/50 bg-primary-500/10' : 'border-overlay-6 bg-overlay-2 hover:border-primary-500/30'}`}>
      <span className="text-xs font-bold text-surface-100">{name}</span>
      {desc && <p className="text-[10px] text-surface-500 mt-0.5 leading-snug">{desc}</p>}
    </button>
  );
}

// ── Section card wrapper with a heading ──────────────────────────────────────
export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-surface-500">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}
