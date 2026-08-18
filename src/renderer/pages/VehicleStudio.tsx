// Vehicle Studio — top-level, server-independent vehicle development workspace.
// Phase 2 (shell) + Phase 3 (scanner/classifier/diagnostics). Import a folder or
// ZIP → real scan (main VehicleStudio service) → workspace with Overview,
// Vehicles, Files, and Diagnostics. Editing engines (Smart Tuning, handling.meta
// editor, fixer, build/export, server install) arrive in later phases and are
// clearly marked "coming next" — no faked controls.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Car, FolderOpen, FileArchive, Upload, Wrench, Sparkles, AlertTriangle,
  CheckCircle2, XCircle, Info, Loader2, ArrowLeft, Package, FileCode, Clock,
  Gauge, ShieldCheck, RefreshCw, Boxes, Save, RotateCcw, Download, Search,
  X, Server, ChevronRight, Undo2,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

const RECENT_KEY = 'vs_recent';
interface Recent { name: string; path: string; type: string; at: number; }
const loadRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const saveRecent = (r: Recent[]) => localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 8)));

type Tab = 'overview' | 'tune' | 'handling' | 'vehicles' | 'files' | 'diagnostics';

export default function VehicleStudio() {
  const [scan, setScan] = useState<VSScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [recent, setRecent] = useState<Recent[]>(loadRecent());

  // copy=true on a fresh import (makes a safe workspace copy so the original is
  // never modified); re-opening a recent points at the existing workspace.
  const runScan = async (inputPath: string, copy: boolean) => {
    if (!inputPath || !window.electronAPI?.vehicleStudio) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.vehicleStudio.scan(inputPath, copy);
      if (!res.ok || !res.data) { toast.error(res.error || 'Could not scan that vehicle'); return; }
      const data = res.data;
      setScan(data);
      setTab('overview');
      const next = [{ name: data.name, path: data.workspacePath, type: data.vehicles[0]?.type || 'Vehicle', at: Date.now() },
        ...recent.filter((r) => r.path !== data.workspacePath && r.path !== inputPath)];
      setRecent(next); saveRecent(next);
      toast.success(`Scanned ${data.name}`);
    } catch (e: any) { toast.error(e?.message || 'Scan failed'); }
    finally { setLoading(false); }
  };

  const importFolder = async () => { const p = await window.electronAPI?.vehicleStudio.pickFolder(); if (p) runScan(p, true); };
  const importZip = async () => { const p = await window.electronAPI?.vehicleStudio.pickZip(); if (p) runScan(p, true); };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f: any = e.dataTransfer.files?.[0];
    if (f?.path) runScan(f.path, true);
    else toast.error('Could not read that item — use Import Folder/ZIP instead.');
  };

  if (loading && !scan) return <Scanning />;
  if (scan) return <Workspace scan={scan} onBack={() => setScan(null)} onRescan={() => runScan(scan.workspacePath, false)} tab={tab} setTab={setTab} rescanning={loading} />;

  // ── Dashboard ────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center"><Car size={22} className="text-primary-300" /></div>
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Vehicle Studio</h1>
          <p className="text-sm text-surface-400">Import, tune, diagnose, and export FiveM vehicles — no server required.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Import + drop zone */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-2">
            <button onClick={importFolder} className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2.5"><FolderOpen size={15} /> Import Folder</button>
            <button onClick={importZip} className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2.5"><FileArchive size={15} /> Open ZIP</button>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={importFolder}
            className={`cursor-pointer rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center py-16 transition-all ${
              dragOver ? 'border-primary-500/60 bg-primary-500/10' : 'border-overlay-8 bg-overlay-2 hover:border-primary-500/30'
            }`}
          >
            <Upload size={34} className={dragOver ? 'text-primary-300' : 'text-surface-500'} />
            <p className="mt-3 text-sm font-semibold text-surface-200">Drop a FiveM vehicle here</p>
            <p className="text-xs text-surface-500 mt-1">A resource folder or a .zip — Vehicle Studio scans it automatically.</p>
          </div>
        </div>

        {/* Recent */}
        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2 flex items-center gap-1.5"><Clock size={11} /> Recent Vehicles</p>
          {recent.length === 0 ? (
            <p className="text-xs text-surface-500 py-8 text-center">Nothing yet — import a vehicle to begin.</p>
          ) : (
            <div className="space-y-1">
              {recent.map((r) => (
                <button key={r.path} onClick={() => runScan(r.path, false)} className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-transparent hover:bg-overlay-4 hover:border-overlay-6 text-left transition-all">
                  <Car size={14} className="text-primary-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-surface-100 truncate">{r.name}</p>
                    <p className="text-[10px] text-surface-500 truncate">{r.type}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tools */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-3">Tools</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { icon: Gauge, label: 'Vehicle Editor', desc: 'handling.meta & more' },
            { icon: Sparkles, label: 'Smart Tuning', desc: 'type-aware presets' },
            { icon: ShieldCheck, label: 'Diagnostics', desc: 'validate the resource' },
            { icon: Wrench, label: 'Resource Fixer', desc: 'safe auto-repairs' },
            { icon: Boxes, label: 'Preset Manager', desc: 'built-in & custom' },
          ].map((t) => (
            <div key={t.label} onClick={() => toast('Import a vehicle to use this', { icon: '🚗' })}
              className="cursor-pointer rounded-xl border border-overlay-6 bg-overlay-2 p-4 hover:border-primary-500/30 transition-all">
              <t.icon size={18} className="text-primary-300 mb-2" />
              <p className="text-sm font-semibold text-surface-100">{t.label}</p>
              <p className="text-[11px] text-surface-500">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function Scanning() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="card flex flex-col items-center py-20">
        <Loader2 size={30} className="animate-spin text-primary-400 mb-3" />
        <p className="text-sm font-semibold text-surface-200">Scanning vehicle…</p>
        <p className="text-xs text-surface-500 mt-1">Detecting models, metadata, and references.</p>
      </div>
    </div>
  );
}

/* ═══════════════════ Workspace ═══════════════════ */
function Workspace({ scan, onBack, onRescan, tab, setTab, rescanning }: {
  scan: VSScan; onBack: () => void; onRescan: () => void; tab: Tab; setTab: (t: Tab) => void; rescanning: boolean;
}) {
  const withHandling = scan.vehicles.filter((v) => v.handlingId && v.hasHandling);
  const [handlingId, setHandlingId] = useState<string | null>(withHandling[0]?.handlingId || null);
  const [showBuild, setShowBuild] = useState(false);
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'tune', label: 'Smart Tune', icon: Sparkles },
    { id: 'handling', label: 'Handling', icon: Gauge },
    { id: 'vehicles', label: `Vehicles (${scan.vehicles.length})`, icon: Car },
    { id: 'files', label: 'Files', icon: FileCode },
    { id: 'diagnostics', label: `Diagnostics (${scan.summary.errors + scan.summary.warnings})`, icon: ShieldCheck },
  ];
  const ok = scan.summary.errors === 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-3 border-b border-overlay-6 flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-overlay-6 transition-all"><ArrowLeft size={16} /></button>
        <div className="w-11 h-11 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shrink-0"><Car size={20} className="text-primary-300" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-surface-100 truncate">{scan.name}</h1>
          <p className="text-[11px] text-surface-500 font-mono truncate">{scan.workspacePath}</p>
        </div>
        <button onClick={onRescan} disabled={rescanning} className="btn-secondary flex items-center gap-2 text-xs py-2">
          {rescanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Re-scan
        </button>
        <button onClick={() => setShowBuild(true)} className="btn-primary flex items-center gap-2 text-xs py-2">
          <Package size={13} /> Build Vehicle
        </button>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left tabs */}
        <div className="w-52 shrink-0 border-r border-overlay-6 p-2 space-y-1 overflow-y-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all ${
                tab === t.id ? 'bg-primary-500/10 text-primary-200 border border-primary-500/25' : 'text-surface-400 hover:bg-overlay-4 border border-transparent'
              }`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
          {withHandling.length > 1 && (tab === 'tune' || tab === 'handling') && (
            <div className="pt-3 mt-2 border-t border-overlay-6">
              <p className="text-[9px] uppercase tracking-wider text-surface-600 px-1 mb-1">Editing vehicle</p>
              <select value={handlingId || ''} onChange={(e) => setHandlingId(e.target.value)}
                className="w-full bg-overlay-3 border border-overlay-6 rounded-lg px-2 py-1.5 text-xs text-surface-200 focus:outline-none">
                {withHandling.map((v) => <option key={v.modelName} value={v.handlingId!}>{v.modelName}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {tab === 'overview' && <OverviewTab scan={scan} />}
          {tab === 'tune' && (handlingId ? <SmartTuneTab root={scan.root} handlingId={handlingId} type={withHandling.find((v) => v.handlingId === handlingId)?.type || 'Unknown'} onChanged={onRescan} /> : <NoHandling />)}
          {tab === 'handling' && (handlingId ? <HandlingTab root={scan.root} handlingId={handlingId} onChanged={onRescan} /> : <NoHandling />)}
          {tab === 'vehicles' && <VehiclesTab scan={scan} />}
          {tab === 'files' && <FilesTab scan={scan} />}
          {tab === 'diagnostics' && <DiagnosticsTab scan={scan} onRescan={onRescan} />}
        </div>
      </div>

      {showBuild && <BuildModal scan={scan} onClose={() => setShowBuild(false)} />}

      {/* Footer status */}
      <div className="shrink-0 px-6 py-2.5 border-t border-overlay-6 flex items-center gap-4 text-xs">
        <span className={`flex items-center gap-1.5 font-semibold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {ok ? 'Valid' : 'Has errors'}
        </span>
        <span className="text-red-400">{scan.summary.errors} Errors</span>
        <span className="text-amber-400">{scan.summary.warnings} Warnings</span>
        <span className="text-sky-400">{scan.summary.info} Info</span>
        <span className="flex-1" />
        <button onClick={onRescan} disabled={rescanning} className="text-primary-300 hover:text-primary-200 font-semibold flex items-center gap-1.5">
          {rescanning ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Validate
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-surface-100' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-overlay-6 bg-overlay-2 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">{label}</p>
      <p className={`text-sm font-bold truncate ${tone}`}>{value}</p>
    </div>
  );
}

function OverviewTab({ scan }: { scan: VSScan }) {
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Vehicles" value={scan.vehicles.length || scan.counts.vehicles} />
        <Stat label="Model files" value={scan.counts.yft} />
        <Stat label="Textures" value={scan.counts.ytd} />
        <Stat label="Manifest" value={scan.manifest.type === 'fxmanifest' ? 'fxmanifest.lua' : scan.manifest.type === '__resource' ? '__resource.lua' : 'Missing'}
          tone={scan.manifest.exists ? (scan.manifest.type === 'fxmanifest' ? 'text-emerald-400' : 'text-amber-400') : 'text-red-400'} />
      </div>

      {scan.vehicles[0] && (
        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-3">Primary vehicle</p>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shrink-0"><Car size={22} className="text-primary-300" /></div>
            <div className="min-w-0">
              <p className="text-base font-bold text-surface-100">{scan.vehicles[0].modelName}</p>
              <p className="text-xs text-surface-400">
                {scan.vehicles[0].type}
                <span className={`ml-2 ${scan.vehicles[0].typeConfidence === 'High' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {scan.vehicles[0].typeConfidence} confidence
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
        scan.summary.errors ? 'border-red-500/25 bg-red-500/10' : scan.summary.warnings ? 'border-amber-500/25 bg-amber-500/10' : 'border-emerald-500/25 bg-emerald-500/10'
      }`}>
        {scan.summary.errors ? <XCircle size={18} className="text-red-400 shrink-0" /> : scan.summary.warnings ? <AlertTriangle size={18} className="text-amber-400 shrink-0" /> : <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
        <p className="text-sm text-surface-200">
          {scan.summary.errors ? `${scan.summary.errors} error(s) need attention before this vehicle will work.`
            : scan.summary.warnings ? `No blocking errors, but ${scan.summary.warnings} warning(s) to review.`
            : 'No problems detected — this resource looks healthy.'}
        </p>
      </div>
    </div>
  );
}

function VehiclesTab({ scan }: { scan: VSScan }) {
  if (scan.vehicles.length === 0) return <p className="text-sm text-surface-500">No vehicles.meta entries found. {scan.counts.yft > 0 ? 'Model files exist but have no definitions.' : ''}</p>;
  return (
    <div className="space-y-2 max-w-3xl">
      {scan.vehicles.map((v) => (
        <div key={v.modelName} className="card">
          <div className="flex items-center gap-3">
            <Car size={16} className="text-primary-400 shrink-0" />
            <span className="text-sm font-bold text-surface-100 flex-1 truncate">{v.modelName}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-overlay-4 text-surface-300 border border-overlay-6">{v.type}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-[11px]">
            <Field label="Handling ID" value={v.handlingId || '—'} ok={v.hasHandling} warn={!!v.handlingId && !v.hasHandling} />
            <Field label="Model (.yft)" value={v.hasModel ? 'Found' : 'Missing'} ok={v.hasModel} warn={!v.hasModel} />
            <Field label="TXD" value={v.txdName || '—'} />
            <Field label="Class" value={v.vehicleClass || 'Unknown'} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-surface-600">{label}</p>
      <p className={`font-semibold truncate ${warn ? 'text-red-400' : ok ? 'text-emerald-400' : 'text-surface-200'}`}>{value}</p>
    </div>
  );
}

function FilesTab({ scan }: { scan: VSScan }) {
  const groups: { label: string; files: string[] }[] = [
    { label: 'handling.meta', files: scan.metaFiles.handling },
    { label: 'vehicles.meta', files: scan.metaFiles.vehicles },
    { label: 'carvariations.meta', files: scan.metaFiles.carvariations },
    { label: 'vehiclelayouts.meta', files: scan.metaFiles.vehiclelayouts },
  ];
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Model files (.yft)" value={scan.counts.yft} />
        <Stat label="Textures (.ytd)" value={scan.counts.ytd} />
        <Stat label="Meta files" value={scan.counts.meta} />
      </div>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1.5">{g.label}</p>
          {g.files.length === 0 ? <p className="text-xs text-surface-600">none</p> : (
            <div className="space-y-1">
              {g.files.map((f) => (
                <div key={f} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-overlay-4 bg-overlay-2 text-xs">
                  <FileCode size={12} className="text-surface-500" /> <span className="font-mono text-surface-300 truncate">{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DiagnosticsTab({ scan, onRescan }: { scan: VSScan; onRescan: () => void }) {
  const [fixing, setFixing] = useState(false);
  const fixManifest = async () => {
    setFixing(true);
    const r = await window.electronAPI.vehicleStudio.generateManifest(scan.root);
    setFixing(false);
    if (r.ok) { toast.success('Generated fxmanifest.lua'); onRescan(); }
    else toast.error(r.error || 'Could not generate manifest');
  };

  if (scan.diagnostics.length === 0) return (
    <div className="card flex flex-col items-center py-16 text-center max-w-xl">
      <CheckCircle2 size={34} className="text-emerald-400 mb-3" />
      <p className="text-sm font-bold text-surface-100">No problems detected</p>
      <p className="text-xs text-surface-500 mt-1">Models, metadata, and cross-references all check out.</p>
    </div>
  );
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...scan.diagnostics].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="space-y-2 max-w-3xl">
      {sorted.map((d) => {
        const tone = d.severity === 'error' ? 'border-red-500/25 bg-red-500/5' : d.severity === 'warning' ? 'border-amber-500/25 bg-amber-500/5' : 'border-sky-500/25 bg-sky-500/5';
        const Icon = d.severity === 'error' ? XCircle : d.severity === 'warning' ? AlertTriangle : Info;
        const ic = d.severity === 'error' ? 'text-red-400' : d.severity === 'warning' ? 'text-amber-400' : 'text-sky-400';
        // The only safe auto-fix wired so far is manifest generation.
        const canFix = d.autoFixable && (d.id === 'no-manifest');
        return (
          <div key={d.id} className={`rounded-xl border p-3 ${tone}`}>
            <div className="flex items-start gap-2.5">
              <Icon size={15} className={`${ic} shrink-0 mt-0.5`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-surface-100">{d.problem}</p>
                <p className="text-xs text-surface-400 mt-0.5">{d.detail}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-overlay-4 text-surface-500 font-mono">{d.file}</span>
                  {d.vehicle && <span className="text-[10px] px-1.5 py-0.5 rounded bg-overlay-4 text-surface-500">{d.vehicle}</span>}
                  {d.autoFixable && !canFix && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/25">auto-fixable (soon)</span>}
                </div>
                {d.fix && <p className="text-[11px] text-emerald-300/90 mt-1.5">Fix: {d.fix}</p>}
              </div>
              {canFix && (
                <button onClick={fixManifest} disabled={fixing} className="shrink-0 btn-primary text-[11px] py-1.5 px-3 flex items-center gap-1.5">
                  {fixing ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />} Fix
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NoHandling() {
  return (
    <div className="card flex flex-col items-center py-16 text-center max-w-xl">
      <Gauge size={32} className="text-surface-600 mb-3" />
      <p className="text-sm font-bold text-surface-100">No editable handling found</p>
      <p className="text-xs text-surface-500 mt-1">This resource has no vehicle with a matching handling entry to tune.</p>
    </div>
  );
}

/* ═══════════════════ Smart Tune ═══════════════════ */
function SmartTuneTab({ root, handlingId, type, onChanged }: { root: string; handlingId: string; type: string; onChanged: () => void }) {
  const [rec, setRec] = useState<{ recommended: string; alternatives: string[]; profiles: { id: string; name: string; desc: string }[] } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name?: string; changes?: { name: string; from: string; to: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { window.electronAPI.vehicleStudio.recommend(type).then((r) => { setRec(r); setSel(r.recommended); }); }, [type]);
  React.useEffect(() => {
    if (!sel) return;
    window.electronAPI.vehicleStudio.previewTune(root, handlingId, sel).then((p) => setPreview(p.ok ? { name: p.name, changes: p.changes } : null));
  }, [sel, root, handlingId]);

  const apply = async () => {
    if (!sel) return;
    setBusy(true);
    const r = await window.electronAPI.vehicleStudio.applyTune(root, handlingId, sel);
    setBusy(false);
    if (r.ok) { toast.success(`Applied ${preview?.name} (${r.applied} fields)`); onChanged(); if (sel) window.electronAPI.vehicleStudio.previewTune(root, handlingId, sel).then((p) => setPreview(p.ok ? { name: p.name, changes: p.changes } : null)); }
    else toast.error(r.error || 'Could not apply preset');
  };
  const undo = async () => { const r = await window.electronAPI.vehicleStudio.undoHandling(root, handlingId); if (r.ok) { toast.success('Reverted last change'); onChanged(); if (sel) window.electronAPI.vehicleStudio.previewTune(root, handlingId, sel).then((p) => setPreview(p.ok ? { name: p.name, changes: p.changes } : null)); } else toast.error(r.error || 'Nothing to undo'); };

  if (!rec) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Loading presets…</div>;
  const profName = (id: string) => rec.profiles.find((p) => p.id === id)?.name || id;
  const ordered = [rec.recommended, ...rec.alternatives.filter((a) => a !== rec.recommended)];

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-surface-300">Detected <span className="font-bold text-surface-100">{type}</span> — pick a preset. It tunes around the vehicle's real values and you preview every change before applying.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {ordered.map((id) => {
          const p = rec.profiles.find((x) => x.id === id); if (!p) return null;
          const isRec = id === rec.recommended;
          return (
            <button key={id} onClick={() => setSel(id)}
              className={`text-left rounded-xl border p-3 transition-all ${sel === id ? 'border-primary-500/50 bg-primary-500/10' : 'border-overlay-6 bg-overlay-2 hover:border-primary-500/25'}`}>
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-primary-300" />
                <span className="text-sm font-bold text-surface-100">{p.name}</span>
                {isRec && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">RECOMMENDED</span>}
              </div>
              <p className="text-[11px] text-surface-500 mt-1">{p.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Preview diff */}
      {preview && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-surface-100">{profName(sel!)} — preview</p>
            <div className="flex items-center gap-2">
              <button onClick={undo} className="btn-secondary text-[11px] py-1.5 flex items-center gap-1.5"><Undo2 size={12} /> Undo last</button>
              <button onClick={apply} disabled={busy || (preview.changes?.length ?? 0) === 0} className="btn-primary text-[11px] py-1.5 flex items-center gap-1.5">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Apply preset
              </button>
            </div>
          </div>
          {(preview.changes?.length ?? 0) === 0 ? (
            <p className="text-xs text-surface-500">This vehicle already matches this preset — no changes.</p>
          ) : (
            <div className="space-y-1">
              {preview.changes!.map((c) => (
                <div key={c.name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-overlay-4 bg-overlay-2 text-xs">
                  <span className="font-mono text-surface-300 flex-1 truncate">{c.name}</span>
                  <span className="text-surface-500">{parseFloat(c.from)}</span>
                  <ChevronRight size={12} className="text-surface-600" />
                  <span className="text-emerald-300 font-semibold">{parseFloat(c.to)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ Handling editor ═══════════════════ */
const HANDLING_CATEGORIES: { title: string; fields: string[] }[] = [
  { title: 'General', fields: ['fMass', 'fInitialDragCoeff', 'fPercentSubmerged'] },
  { title: 'Transmission', fields: ['nInitialDriveGears', 'fDriveBiasFront', 'fInitialDriveForce', 'fDriveInertia', 'fInitialDriveMaxFlatVel', 'fClutchChangeRateScaleUpShift', 'fClutchChangeRateScaleDownShift'] },
  { title: 'Brakes', fields: ['fBrakeForce', 'fBrakeBiasFront', 'fHandBrakeForce'] },
  { title: 'Steering', fields: ['fSteeringLock'] },
  { title: 'Traction', fields: ['fTractionCurveMax', 'fTractionCurveMin', 'fTractionCurveLateral', 'fTractionSpringDeltaMax', 'fLowSpeedTractionLossMult', 'fCamberStiffnesss', 'fTractionBiasFront', 'fTractionLossMult'] },
  { title: 'Suspension', fields: ['fSuspensionForce', 'fSuspensionCompDamp', 'fSuspensionReboundDamp', 'fSuspensionUpperLimit', 'fSuspensionLowerLimit', 'fSuspensionRaise', 'fSuspensionBiasFront', 'fAntiRollBarForce', 'fAntiRollBarBiasFront', 'fRollCentreHeightFront', 'fRollCentreHeightRear'] },
  { title: 'Damage', fields: ['fCollisionDamageMult', 'fWeaponDamageMult', 'fDeformationDamageMult', 'fEngineDamageMult'] },
];
const TIPS: Record<string, string> = {
  fInitialDriveForce: 'Engine power — higher accelerates faster and raises top speed.',
  fTractionCurveMax: 'Peak grip — higher corners harder; too high feels glued to the road.',
  fBrakeForce: 'Braking power — higher stops shorter.',
  fMass: 'Vehicle weight in kg — affects inertia, grip and momentum.',
  fSteeringLock: 'Max steering angle in degrees — higher turns sharper.',
  fDriveBiasFront: 'Drivetrain: 0 = RWD, 1 = FWD, 0.5 = AWD.',
  nInitialDriveGears: 'Number of gears.',
  fSuspensionForce: 'Suspension stiffness — higher rides firmer.',
};

function HandlingTab({ root, handlingId, onChanged }: { root: string; handlingId: string; onChanged: () => void }) {
  const [fields, setFields] = useState<VSHandlingField[]>([]);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const r = await window.electronAPI.vehicleStudio.readHandling(root, handlingId);
    setLoading(false);
    if (!r.ok || !r.fields) { toast.error(r.error || 'Could not read handling'); return; }
    setFields(r.fields);
    const o: Record<string, string> = {};
    for (const f of r.fields) {
      if (f.kind === 'vector') { o[`${f.name}.x`] = f.x!; o[`${f.name}.y`] = f.y!; o[`${f.name}.z`] = f.z!; }
      else o[f.name] = f.value!;
    }
    setOrig(o); setEdits({});
  };
  React.useEffect(() => { load(); }, [root, handlingId]);

  const val = (k: string) => (k in edits ? edits[k] : orig[k]) ?? '';
  const setVal = (k: string, v: string) => setEdits((e) => ({ ...e, [k]: v }));
  const dirtyKeys = Object.keys(edits).filter((k) => edits[k] !== orig[k]);

  const save = async () => {
    if (dirtyKeys.length === 0) return;
    const changes: VSHandlingChange[] = [];
    for (const k of dirtyKeys) {
      const [name, axis] = k.split('.');
      changes.push(axis ? { name, axis: axis as 'x' | 'y' | 'z', value: edits[k] } : { name, value: edits[k] });
    }
    setSaving(true);
    const r = await window.electronAPI.vehicleStudio.writeHandling(root, handlingId, changes);
    setSaving(false);
    if (r.ok) { toast.success(`Saved ${r.applied} field(s)`); await load(); onChanged(); }
    else toast.error(r.error || 'Save failed');
  };
  const undo = async () => { const r = await window.electronAPI.vehicleStudio.undoHandling(root, handlingId); if (r.ok) { toast.success('Reverted last save'); await load(); onChanged(); } else toast.error(r.error || 'Nothing to undo'); };

  if (loading) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Reading handling.meta…</div>;

  const known = new Set(HANDLING_CATEGORIES.flatMap((c) => c.fields));
  const otherScalars = fields.filter((f) => f.kind !== 'vector' && !known.has(f.name)).map((f) => f.name);
  const vectors = fields.filter((f) => f.kind === 'vector');
  const cats = [...HANDLING_CATEGORIES, { title: 'Other (from file)', fields: otherScalars }];
  const match = (n: string) => !search || n.toLowerCase().includes(search.toLowerCase());

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3 sticky top-0 bg-surface-950/80 backdrop-blur -mx-1 px-1 py-1 z-10">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fields… (speed, brake, traction)"
            className="w-full bg-overlay-3 border border-overlay-6 rounded-xl pl-9 pr-3 py-2 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
        </div>
        <button onClick={undo} className="btn-secondary text-xs py-2 flex items-center gap-1.5"><Undo2 size={13} /> Undo save</button>
        <button onClick={save} disabled={saving || dirtyKeys.length === 0} className="btn-primary text-xs py-2 flex items-center gap-1.5">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save{dirtyKeys.length ? ` (${dirtyKeys.length})` : ''}
        </button>
      </div>

      {cats.map((cat) => {
        const catFields = cat.fields.filter((name) => fields.some((f) => f.name === name) && match(name));
        const catVectors = cat.title === 'General' ? vectors.filter((v) => match(v.name)) : [];
        if (catFields.length === 0 && catVectors.length === 0) return null;
        return (
          <div key={cat.title} className="card">
            <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">{cat.title}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {catFields.map((name) => {
                const dirty = (name in edits) && edits[name] !== orig[name];
                return (
                  <div key={name} className="flex items-center gap-2">
                    <label className="text-[11px] font-mono text-surface-400 flex-1 truncate" title={TIPS[name] || name}>{name}{TIPS[name] && <Info size={9} className="inline ml-1 text-surface-600" />}</label>
                    <input value={val(name)} onChange={(e) => setVal(name, e.target.value)} spellCheck={false}
                      className={`w-28 bg-overlay-3 border rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none ${dirty ? 'border-primary-500/50 text-primary-200' : 'border-overlay-6 text-surface-200'}`} />
                    {dirty && <button onClick={() => setEdits((e) => { const n = { ...e }; delete n[name]; return n; })} title="Revert" className="text-surface-500 hover:text-surface-200"><RotateCcw size={12} /></button>}
                  </div>
                );
              })}
              {catVectors.map((v) => (
                <div key={v.name} className="sm:col-span-2 flex items-center gap-2">
                  <label className="text-[11px] font-mono text-surface-400 flex-1 truncate">{v.name}</label>
                  {(['x', 'y', 'z'] as const).map((ax) => (
                    <input key={ax} value={val(`${v.name}.${ax}`)} onChange={(e) => setVal(`${v.name}.${ax}`, e.target.value)} spellCheck={false}
                      className={`w-16 bg-overlay-3 border rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none ${(`${v.name}.${ax}` in edits) && edits[`${v.name}.${ax}`] !== orig[`${v.name}.${ax}`] ? 'border-primary-500/50 text-primary-200' : 'border-overlay-6 text-surface-200'}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-surface-600">Edits are surgical — only the fields you change are rewritten, and a backup is saved before every write. Unknown fields and comments are preserved.</p>
    </div>
  );
}

/* ═══════════════════ Build / Export / Install ═══════════════════ */
function BuildModal({ scan, onClose }: { scan: VSScan; onClose: () => void }) {
  const { servers } = useAppStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [serverId, setServerId] = useState(servers[0]?.id || '');
  const [addEnsure, setAddEnsure] = useState(true);
  const resourceName = scan.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

  const exportZip = async () => { setBusy('zip'); const r = await window.electronAPI.vehicleStudio.exportZip(scan.root, resourceName); setBusy(null); if (r.ok) toast.success('Exported ZIP'); else if (r.error !== 'cancelled') toast.error(r.error || 'Export failed'); };
  const exportFolder = async () => { setBusy('folder'); const r = await window.electronAPI.vehicleStudio.exportFolder(scan.root, resourceName); setBusy(null); if (r.ok) toast.success('Exported folder'); else if (r.error !== 'cancelled') toast.error(r.error || 'Export failed'); };
  const install = async () => {
    const srv = servers.find((s) => s.id === serverId); if (!srv) { toast.error('Pick a server'); return; }
    setBusy('install');
    const r = await window.electronAPI.vehicleStudio.install(scan.root, srv.installPath, resourceName, addEnsure);
    setBusy(null);
    if (r.ok) toast.success(`Installed to ${srv.name}${addEnsure ? ' + ensure added' : ''}`); else toast.error(r.error || 'Install failed');
  };

  const checks = [
    { ok: scan.manifest.exists, label: 'fxmanifest.lua' },
    { ok: scan.metaFiles.handling.length > 0, label: 'handling.meta' },
    { ok: scan.metaFiles.vehicles.length > 0, label: 'vehicles.meta' },
    { ok: scan.counts.yft > 0, label: 'Model files' },
    { ok: scan.summary.errors === 0, label: 'No blocking errors' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-panel p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-surface-100 flex items-center gap-2"><Package size={18} className="text-primary-300" /> Build {scan.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-500 hover:text-surface-100 hover:bg-overlay-6"><X size={16} /></button>
        </div>

        <div className="rounded-xl border border-overlay-6 bg-overlay-2 p-3 mb-4 space-y-1">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-xs">
              {c.ok ? <CheckCircle2 size={13} className="text-emerald-400" /> : <XCircle size={13} className="text-red-400" />}
              <span className={c.ok ? 'text-surface-300' : 'text-red-300'}>{c.label}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={exportZip} disabled={!!busy} className="flex-1 btn-secondary text-xs py-2.5 flex items-center justify-center gap-1.5">{busy === 'zip' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Export ZIP</button>
          <button onClick={exportFolder} disabled={!!busy} className="flex-1 btn-secondary text-xs py-2.5 flex items-center justify-center gap-1.5">{busy === 'folder' ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />} Export Folder</button>
        </div>

        <div className="rounded-xl border border-overlay-6 bg-overlay-2 p-3">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2 flex items-center gap-1.5"><Server size={11} /> Install to server (optional)</p>
          {servers.length === 0 ? (
            <p className="text-xs text-surface-500">No servers yet — create one in My Servers first.</p>
          ) : (
            <>
              <select value={serverId} onChange={(e) => setServerId(e.target.value)} className="w-full bg-overlay-3 border border-overlay-6 rounded-lg px-2 py-1.5 text-xs text-surface-200 mb-2 focus:outline-none">
                {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs text-surface-300 mb-2 cursor-pointer">
                <input type="checkbox" checked={addEnsure} onChange={(e) => setAddEnsure(e.target.checked)} /> Add <span className="font-mono">ensure {resourceName}</span> to server.cfg (backed up first)
              </label>
              <button onClick={install} disabled={!!busy} className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1.5">
                {busy === 'install' ? <Loader2 size={13} className="animate-spin" /> : <Server size={13} />} Install to {servers.find((s) => s.id === serverId)?.name || 'server'}
              </button>
              <p className="text-[10px] text-surface-600 mt-2">Copies to resources/[vehicles]/{resourceName}. An existing copy is backed up first.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
