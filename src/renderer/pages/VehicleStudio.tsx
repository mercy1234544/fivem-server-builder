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
  Gauge, Cog, ShieldCheck, RefreshCw, Boxes,
} from 'lucide-react';

const RECENT_KEY = 'vs_recent';
interface Recent { name: string; path: string; type: string; at: number; }
const loadRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const saveRecent = (r: Recent[]) => localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 8)));

type Tab = 'overview' | 'vehicles' | 'files' | 'diagnostics' | 'editors';

export default function VehicleStudio() {
  const [scan, setScan] = useState<VSScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [recent, setRecent] = useState<Recent[]>(loadRecent());

  const runScan = async (inputPath: string) => {
    if (!inputPath || !window.electronAPI?.vehicleStudio) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.vehicleStudio.scan(inputPath);
      if (!res.ok || !res.data) { toast.error(res.error || 'Could not scan that vehicle'); return; }
      setScan(res.data);
      setTab('overview');
      const next = [{ name: res.data.name, path: inputPath, type: res.data.vehicles[0]?.type || 'Vehicle', at: Date.now() },
        ...recent.filter((r) => r.path !== inputPath)];
      setRecent(next); saveRecent(next);
      toast.success(`Scanned ${res.data.name}`);
    } catch (e: any) { toast.error(e?.message || 'Scan failed'); }
    finally { setLoading(false); }
  };

  const importFolder = async () => { const p = await window.electronAPI?.vehicleStudio.pickFolder(); if (p) runScan(p); };
  const importZip = async () => { const p = await window.electronAPI?.vehicleStudio.pickZip(); if (p) runScan(p); };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f: any = e.dataTransfer.files?.[0];
    if (f?.path) runScan(f.path);
    else toast.error('Could not read that item — use Import Folder/ZIP instead.');
  };

  if (loading && !scan) return <Scanning />;
  if (scan) return <Workspace scan={scan} onBack={() => setScan(null)} onRescan={() => runScan(scan.isZip ? scan.workspacePath : scan.root)} tab={tab} setTab={setTab} rescanning={loading} />;

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
                <button key={r.path} onClick={() => runScan(r.path)} className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-transparent hover:bg-overlay-4 hover:border-overlay-6 text-left transition-all">
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
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'vehicles', label: `Vehicles (${scan.vehicles.length})`, icon: Car },
    { id: 'files', label: 'Files', icon: FileCode },
    { id: 'diagnostics', label: `Diagnostics (${scan.summary.errors + scan.summary.warnings})`, icon: ShieldCheck },
    { id: 'editors', label: 'Tuning & Editors', icon: Gauge },
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
        <button onClick={() => toast('Build & export lands in the next Vehicle Studio update', { icon: '🚧' })} className="btn-primary flex items-center gap-2 text-xs py-2">
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
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {tab === 'overview' && <OverviewTab scan={scan} />}
          {tab === 'vehicles' && <VehiclesTab scan={scan} />}
          {tab === 'files' && <FilesTab scan={scan} />}
          {tab === 'diagnostics' && <DiagnosticsTab scan={scan} />}
          {tab === 'editors' && <EditorsTab />}
        </div>
      </div>

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

function DiagnosticsTab({ scan }: { scan: VSScan }) {
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
                  {d.autoFixable && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/25">auto-fixable (soon)</span>}
                </div>
                {d.fix && <p className="text-[11px] text-emerald-300/90 mt-1.5">Fix: {d.fix}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditorsTab() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-primary-500/25 bg-primary-500/10 p-4 flex items-start gap-3">
        <Cog size={18} className="text-primary-300 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-primary-200">Editing engines are in the next Vehicle Studio update</p>
          <p className="text-xs text-surface-300 mt-1 leading-relaxed">
            The scanner, classifier, and diagnostics you're using now are fully live. The editing layer is being built on top and will
            arrive next — with real, non-faked controls that write actual FiveM values.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {[
          { icon: Sparkles, t: 'Smart Tuning', d: 'Type-aware presets (Pickup, Sports, Police…) that tune around the vehicle\'s real mass, drivetrain, and gearing.' },
          { icon: Gauge, t: 'handling.meta editor', d: 'Structured editor with an Advanced mode — surgical field edits that preserve unknown fields and comments.' },
          { icon: FileCode, t: 'vehicles / carvariations / carcols editors', d: 'Metadata editors that never destroy unsupported data.' },
          { icon: Wrench, t: 'Resource Fixer', d: 'Safe auto-repairs for manifest paths, missing registrations, and structure — with diff previews first.' },
          { icon: Package, t: 'Build & Export + optional Server Install', d: 'Backup, validate, build, export ZIP, or install into a server (optional final step).' },
        ].map((x) => (
          <div key={x.t} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-overlay-6 bg-overlay-2">
            <x.icon size={16} className="text-surface-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-surface-100">{x.t} <span className="text-[10px] text-surface-500 font-normal">— coming next</span></p>
              <p className="text-[11px] text-surface-500">{x.d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
