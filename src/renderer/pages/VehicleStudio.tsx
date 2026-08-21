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
  X, Server, ChevronRight, ChevronDown, Undo2, Cog, Lock, Shield,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

const RECENT_KEY = 'vs_recent';
interface Recent { name: string; path: string; type: string; at: number; }
const loadRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const saveRecent = (r: Recent[]) => localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 8)));

type Tab = 'overview' | 'tune' | 'performance' | 'transmission' | 'handling' | 'brakes' | 'traction' | 'suspension' | 'drivetrain' | 'damage' | 'vehicles' | 'variations' | 'lighting' | 'files' | 'diagnostics';

// Access control is enforced app-wide by AppAccessGate (in Layout), so Vehicle
// Studio no longer gates itself — it renders directly.
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
  // Handling tab: any vehicle with a handlingId (broken ones get a repair panel).
  // Selection is by modelName so BOTH physics (via handlingId) and metadata
  // (via modelName) tabs stay scoped to one vehicle.
  const allVehicles = scan.vehicles;
  const firstGood = allVehicles.find((v) => v.hasHandling) || allVehicles[0];
  const [selModel, setSelModel] = useState<string | null>(firstGood?.modelName || null);
  const selVeh = allVehicles.find((v) => v.modelName === selModel) || firstGood;
  const handlingId = selVeh?.handlingId || null;
  const [showBuild, setShowBuild] = useState(false);
  const groups: { label: string; tabs: { id: Tab; label: string; icon: any }[] }[] = [
    { label: 'Vehicle', tabs: [
      { id: 'overview', label: 'Overview', icon: Info },
      { id: 'tune', label: 'Smart Tune', icon: Sparkles },
      { id: 'performance', label: 'Performance', icon: Gauge },
    ] },
    { label: 'Physics', tabs: [
      { id: 'handling', label: 'Handling', icon: Cog },
      { id: 'transmission', label: 'Transmission', icon: Cog },
      { id: 'drivetrain', label: 'Drivetrain', icon: Cog },
      { id: 'brakes', label: 'Brakes', icon: Cog },
      { id: 'traction', label: 'Traction', icon: Cog },
      { id: 'suspension', label: 'Suspension', icon: Cog },
      { id: 'damage', label: 'Damage', icon: Cog },
    ] },
    { label: 'Metadata', tabs: [
      { id: 'vehicles', label: 'Vehicles', icon: Car },
      { id: 'variations', label: 'Variations', icon: FileCode },
      { id: 'lighting', label: 'Lighting', icon: Sparkles },
    ] },
    { label: 'Tools', tabs: [
      { id: 'files', label: 'Files', icon: FileCode },
      { id: 'diagnostics', label: `Diagnostics (${scan.summary.errors + scan.summary.warnings})`, icon: ShieldCheck },
    ] },
  ];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const ok = scan.summary.errors === 0;
  // Tabs scoped to the selected vehicle (show the vehicle picker).
  const scopedTabs = new Set(['performance', 'transmission', 'drivetrain', 'brakes', 'traction', 'suspension', 'damage', 'handling', 'tune', 'vehicles', 'variations', 'lighting']);

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
        {/* Left tabs — collapsible groups */}
        <div className="w-52 shrink-0 border-r border-overlay-6 p-2 space-y-2 overflow-y-auto">
          {allVehicles.length > 1 && scopedTabs.has(tab) && (
            <div className="pb-2 mb-1 border-b border-overlay-6">
              <p className="text-[9px] uppercase tracking-wider text-surface-600 px-1 mb-1">Editing vehicle</p>
              <select value={selModel || ''} onChange={(e) => setSelModel(e.target.value)}
                className="w-full bg-overlay-3 border border-overlay-6 rounded-lg px-2 py-1.5 text-xs text-surface-200 focus:outline-none">
                {allVehicles.map((v) => <option key={v.modelName} value={v.modelName}>{v.modelName}{!v.hasHandling ? ' ⚠' : ''}</option>)}
              </select>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <button onClick={() => setCollapsed((c) => ({ ...c, [g.label]: !c[g.label] }))}
                className="w-full flex items-center gap-1 px-1 py-1 text-[9px] uppercase tracking-wider text-surface-600 hover:text-surface-400">
                {collapsed[g.label] ? <ChevronRight size={11} /> : <ChevronDown size={11} />} {g.label}
              </button>
              {!collapsed[g.label] && g.tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left text-sm transition-all ${
                    tab === t.id ? 'bg-primary-500/10 text-primary-200 border border-primary-500/25' : 'text-surface-400 hover:bg-overlay-4 border border-transparent'
                  }`}>
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {tab === 'overview' && <OverviewTab scan={scan} />}
          {tab === 'tune' && (handlingId && selVeh?.hasHandling ? <SmartTuneTab root={scan.root} handlingId={handlingId} type={selVeh?.type || 'Unknown'} onChanged={onRescan} />
            : handlingId ? <TuneMissing modelName={selVeh?.modelName || ''} handlingId={handlingId} onGoHandling={() => setTab('handling')} /> : <NoHandling />)}
          {tab === 'handling' && (handlingId ? <HandlingTab root={scan.root} handlingId={handlingId} modelName={selVeh?.modelName || ''} onChanged={onRescan} onGoDiagnostics={() => setTab('diagnostics')} /> : <NoHandling />)}
          {(['performance', 'transmission', 'drivetrain', 'brakes', 'traction', 'suspension', 'damage'] as Tab[]).includes(tab) && (
            handlingId ? <PhysicsTab root={scan.root} handlingId={handlingId} config={PHYS[tab]} onChanged={onRescan} onGoHandling={() => setTab('handling')} /> : <NoHandling />
          )}
          {tab === 'vehicles' && (selVeh ? <MetaEditor root={scan.root} kind="vehicles" modelName={selVeh.modelName} title="Vehicle metadata" onChanged={onRescan} /> : <NoHandling />)}
          {tab === 'variations' && (selVeh ? <MetaEditor root={scan.root} kind="carvariations" modelName={selVeh.modelName} title="Variations (carvariations.meta)" onChanged={onRescan} /> : <NoHandling />)}
          {tab === 'lighting' && (selVeh ? <MetaEditor root={scan.root} kind="carcols" modelName={selVeh.modelName} title="Lighting & sirens (carcols.meta)" onChanged={onRescan} /> : <NoHandling />)}
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

function Ov({ label, value, tone = 'text-surface-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-surface-600">{label}</p>
      <p className={`font-semibold truncate ${tone}`}>{value}</p>
    </div>
  );
}

function OverviewTab({ scan }: { scan: VSScan }) {
  const primary = scan.vehicles.find((v) => v.hasHandling) || scan.vehicles[0];
  const [h, setH] = useState<Record<string, number> | null>(null);

  React.useEffect(() => {
    setH(null);
    if (!primary?.handlingId || !primary.hasHandling) return;
    window.electronAPI.vehicleStudio.readHandling(scan.root, primary.handlingId).then((r) => {
      if (!r.ok || !r.fields) return;
      const m: Record<string, number> = {};
      for (const f of r.fields) if (f.value !== undefined) m[f.name] = parseFloat(f.value);
      setH(m);
    });
  }, [scan.root, primary?.handlingId]);

  const mass = h?.fMass;
  const gears = h?.nInitialDriveGears;
  const bias = h?.fDriveBiasFront;
  const drivetrain = bias === undefined ? null : bias <= 0.1 ? 'RWD' : bias >= 0.9 ? 'FWD' : `AWD (${Math.round(bias * 100)}% front)`;
  const topMph = h?.fInitialDriveMaxFlatVel !== undefined ? Math.round(h.fInitialDriveMaxFlatVel * 0.92) : null;
  const pw = (h?.fInitialDriveForce !== undefined && mass) ? (h.fInitialDriveForce / (mass / 1000)) : null;
  const accel = pw === null ? null : pw > 0.28 ? 'Very strong' : pw > 0.22 ? 'Strong' : pw > 0.16 ? 'Moderate' : 'Relaxed';

  return (
    <div className="space-y-5 max-w-3xl">
      <HealthBar summary={scan.summary} />

      {primary && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shrink-0"><Car size={22} className="text-primary-300" /></div>
            <div className="min-w-0">
              <p className="text-base font-bold text-surface-100">{primary.makeName ? `${primary.makeName} · ` : ''}{primary.modelName}</p>
              <p className="text-xs text-surface-400">{primary.type}
                <span className={`ml-2 ${primary.typeConfidence === 'High' ? 'text-emerald-400' : 'text-amber-400'}`}>{primary.typeConfidence} confidence</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
            <Ov label="Model" value={primary.modelName} />
            <Ov label="Class" value={primary.vehicleClass || '—'} />
            <Ov label="Handling" value={primary.handlingId || '—'} tone={primary.hasHandling ? '' : 'text-red-400'} />
            <Ov label="Drivetrain" value={drivetrain || '—'} />
            <Ov label="Gears" value={gears !== undefined ? String(gears) : '—'} />
            <Ov label="Mass" value={mass !== undefined ? `${mass.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg` : '—'} />
          </div>
        </div>
      )}

      {/* Performance estimates (clearly labeled) */}
      {h && (
        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-3">Performance <span className="text-surface-600 normal-case">— estimates</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="~ Top speed" value={topMph !== null ? `${topMph} mph` : '—'} />
            <Stat label="Acceleration" value={accel || '—'} />
            <Stat label="Power/Weight" value={pw !== null ? pw.toFixed(3) : '—'} />
            <Stat label="Gears" value={gears !== undefined ? String(gears) : '—'} />
          </div>
          <p className="text-[10px] text-surface-600 mt-2">Estimated from handling values — not exact real-world figures.</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Vehicles" value={scan.vehicles.length || scan.counts.vehicles} />
        <Stat label="Model files" value={scan.counts.yft} />
        <Stat label="Textures" value={scan.counts.ytd} />
        <Stat label="Manifest" value={scan.manifest.type === 'fxmanifest' ? 'fxmanifest.lua' : scan.manifest.type === '__resource' ? '__resource.lua' : 'Missing'}
          tone={scan.manifest.exists ? (scan.manifest.type === 'fxmanifest' ? 'text-emerald-400' : 'text-amber-400') : 'text-red-400'} />
      </div>

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

// Dispatch a single diagnostic's safe auto-fix; returns ok.
async function applyFix(root: string, d: VSDiagnostic): Promise<{ ok: boolean; error?: string }> {
  if (d.fixKind === 'generate-manifest') return window.electronAPI.vehicleStudio.generateManifest(root);
  if (d.fixKind === 'register-handling') return window.electronAPI.vehicleStudio.registerHandling(root);
  return { ok: false, error: 'Not auto-fixable' };
}

function DiagnosticsTab({ scan, onRescan }: { scan: VSScan; onRescan: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const safeFixable = scan.diagnostics.filter((d) => d.autoFixable && d.fixKind);
  const fixOne = async (d: VSDiagnostic) => {
    setBusy(d.id); const r = await applyFix(scan.root, d); setBusy(null);
    if (r.ok) { toast.success(`Fixed: ${d.problem}`); onRescan(); } else toast.error(r.error || 'Fix failed');
  };
  const fixAll = async () => {
    setBusy('all');
    // De-dupe by fixKind (manifest gen + register handling each run once).
    const kinds = Array.from(new Set(safeFixable.map((d) => d.fixKind)));
    let n = 0;
    for (const k of kinds) { const d = safeFixable.find((x) => x.fixKind === k)!; const r = await applyFix(scan.root, d); if (r.ok) n++; }
    setBusy(null);
    toast.success(`Applied ${n} safe fix${n !== 1 ? 'es' : ''}`); onRescan();
  };

  const order = { error: 0, warning: 1, info: 2 } as const;
  const shown = scan.diagnostics.filter((d) => filter === 'all' || d.severity === filter).sort((a, b) => order[a.severity] - order[b.severity]);
  const cats: VSDiagnostic['category'][] = ['Resource', 'Manifest', 'Vehicle', 'Handling', 'Metadata', 'Files'];

  return (
    <div className="space-y-4 max-w-3xl">
      <HealthBar summary={scan.summary} />

      {/* Summary chips + Fix All */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'error', 'warning', 'info'] as const).map((f) => {
          const n = f === 'all' ? scan.diagnostics.length : scan.diagnostics.filter((d) => d.severity === f).length;
          const label = f === 'all' ? 'All' : f === 'error' ? 'Errors' : f === 'warning' ? 'Warnings' : 'Info';
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${filter === f ? 'bg-primary-500/15 text-primary-200 border-primary-500/30' : 'bg-overlay-3 text-surface-400 border-overlay-6 hover:bg-overlay-4'}`}>
              {label} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
        <span className="flex-1" />
        {safeFixable.length > 0 && (
          <button onClick={fixAll} disabled={!!busy} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
            {busy === 'all' ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />} Fix {Array.from(new Set(safeFixable.map((d) => d.fixKind))).length} Safe Issue{Array.from(new Set(safeFixable.map((d) => d.fixKind))).length !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {scan.diagnostics.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <CheckCircle2 size={34} className="text-emerald-400 mb-3" />
          <p className="text-sm font-bold text-surface-100">No problems detected</p>
          <p className="text-xs text-surface-500 mt-1">Models, metadata, and cross-references all check out.</p>
        </div>
      ) : (
        cats.map((cat) => {
          const items = shown.filter((d) => d.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1.5">{cat}</p>
              <div className="space-y-2">
                {items.map((d) => <DiagnosticRow key={d.id} d={d} busy={busy === d.id} canFix={!!(d.autoFixable && d.fixKind)} onFix={() => fixOne(d)} />)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function DiagnosticRow({ d, busy, canFix, onFix }: { d: VSDiagnostic; busy: boolean; canFix: boolean; onFix: () => void }) {
  const [showWhy, setShowWhy] = useState(false);
  const tone = d.severity === 'error' ? 'border-red-500/25 bg-red-500/5' : d.severity === 'warning' ? 'border-amber-500/25 bg-amber-500/5' : 'border-sky-500/25 bg-sky-500/5';
  const Icon = d.severity === 'error' ? XCircle : d.severity === 'warning' ? AlertTriangle : Info;
  const ic = d.severity === 'error' ? 'text-red-400' : d.severity === 'warning' ? 'text-amber-400' : 'text-sky-400';
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-start gap-2.5">
        <Icon size={15} className={`${ic} shrink-0 mt-0.5`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-surface-100">{d.problem}</p>
          <p className="text-xs text-surface-400 mt-0.5">{d.detail}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-overlay-4 text-surface-500 font-mono">{d.file}{d.line ? `:${d.line}` : ''}</span>
            {d.vehicle && <span className="text-[10px] px-1.5 py-0.5 rounded bg-overlay-4 text-surface-500">{d.vehicle}</span>}
            {d.why && <button onClick={() => setShowWhy((v) => !v)} className="text-[10px] text-primary-300 hover:text-primary-200">Why is this broken?</button>}
            {d.autoFixable && !canFix && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/25">fix in Handling tab</span>}
          </div>
          {showWhy && d.why && <p className="text-[11px] text-surface-300 mt-2 leading-relaxed border-l-2 border-primary-500/40 pl-2">{d.why}</p>}
          {d.fix && <p className="text-[11px] text-emerald-300/90 mt-1.5 font-mono">Fix: {d.fix}</p>}
        </div>
        {canFix && (
          <button onClick={onFix} disabled={busy} className="shrink-0 btn-primary text-[11px] py-1.5 px-3 flex items-center gap-1.5">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />} Fix
          </button>
        )}
      </div>
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
  fInitialDriveMaxFlatVel: 'Drivetrain top-speed cap (game units) — raise for a higher top speed.',
  fInitialDragCoeff: 'Aerodynamic drag — lower raises top speed.',
  fDriveInertia: 'Engine rev responsiveness — higher revs quicker.',
  fClutchChangeRateScaleUpShift: 'Up-shift speed — higher shifts faster.',
  fClutchChangeRateScaleDownShift: 'Down-shift speed — higher shifts faster.',
  fTractionCurveMax: 'Peak grip — higher corners harder; too high feels glued to the road.',
  fTractionCurveMin: 'Grip once the tyres break away (at the limit / sliding).',
  fTractionCurveLateral: 'Sideways grip response.',
  fTractionSpringDeltaMax: 'How far the tyre can flex before losing grip.',
  fLowSpeedTractionLossMult: 'Off-the-line wheelspin — higher = more low-speed slip.',
  fTractionBiasFront: 'Grip balance front↔rear. Above 0.5 = more front grip (understeer).',
  fTractionLossMult: 'Grip loss on poor surfaces.',
  fBrakeForce: 'Braking power — higher stops shorter.',
  fBrakeBiasFront: 'Brake balance front↔rear. 0.5 = even; higher = more front braking.',
  fHandBrakeForce: 'Handbrake strength.',
  fMass: 'Vehicle weight in kg — affects inertia, grip and momentum.',
  fSteeringLock: 'Max steering angle in degrees — higher turns sharper.',
  fDriveBiasFront: 'Drivetrain: 0 = RWD, 1 = FWD, 0.5 = AWD.',
  nInitialDriveGears: 'Number of gears.',
  fSuspensionForce: 'Suspension stiffness — higher rides firmer.',
  fSuspensionCompDamp: 'Compression damping — controls how bumps are absorbed.',
  fSuspensionReboundDamp: 'Rebound damping — controls how the suspension settles.',
  fSuspensionUpperLimit: 'Max upward suspension travel.',
  fSuspensionLowerLimit: 'Max downward suspension travel.',
  fSuspensionRaise: 'Ride height — higher lifts the vehicle.',
  fSuspensionBiasFront: 'Suspension balance front↔rear.',
  fAntiRollBarForce: 'Body-roll resistance in corners — higher = flatter cornering.',
  fCollisionDamageMult: 'How much collisions damage the vehicle.',
  fWeaponDamageMult: 'Damage taken from weapons.',
  fDeformationDamageMult: 'How much the body visually deforms.',
  fEngineDamageMult: 'How quickly the engine takes damage.',
};

function HandlingTab({ root, handlingId, modelName, onChanged, onGoDiagnostics }: { root: string; handlingId: string; modelName: string; onChanged: () => void; onGoDiagnostics: () => void }) {
  const [fields, setFields] = useState<VSHandlingField[]>([]);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [readError, setReadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await window.electronAPI.vehicleStudio.readHandling(root, handlingId);
    setLoading(false);
    if (!r.ok || !r.fields) { setReadError(r.error || 'Could not read handling'); return; }
    setReadError(null);
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
  if (readError) return <HandlingRepair root={root} handlingId={handlingId} modelName={modelName} onFixed={() => { load(); onChanged(); }} onGoDiagnostics={onGoDiagnostics} />;

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

/* ═══════════════════ Themed physics editors (Performance/Brakes/…) ═══════════════════ */
function friendly(name: string): string {
  return name.replace(/^(f|n|vec|str)/, '').replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim();
}
interface PhysicsConfig {
  title: string;
  presetsCategory?: string;
  fields: string[];
  derived?: { label: string; field: string; unit?: string; hint?: string; toDisplay: (raw: number) => string; fromDisplay: (disp: string) => string }[];
  radio?: { label: string; field: string; hint?: string; options: { label: string; value: string }[] };
}
const PHYS: Record<string, PhysicsConfig> = {
  performance: { title: 'Performance', presetsCategory: 'Performance',
    fields: ['fInitialDriveForce', 'fInitialDriveMaxFlatVel', 'fInitialDragCoeff', 'fDriveInertia', 'nInitialDriveGears'],
    derived: [{ label: 'Top speed', field: 'fInitialDriveMaxFlatVel', unit: 'mph', hint: 'estimate', toDisplay: (r) => String(Math.round(r * 0.92)), fromDisplay: (d) => ((parseFloat(d) || 0) / 0.92).toFixed(6) }] },
  transmission: { title: 'Transmission', presetsCategory: 'Transmission',
    fields: ['nInitialDriveGears', 'fInitialDriveForce', 'fDriveInertia', 'fInitialDriveMaxFlatVel', 'fClutchChangeRateScaleUpShift', 'fClutchChangeRateScaleDownShift', 'fDriveBiasFront'] },
  brakes: { title: 'Brakes', presetsCategory: 'Brakes', fields: ['fBrakeForce', 'fBrakeBiasFront', 'fHandBrakeForce'] },
  traction: { title: 'Traction', presetsCategory: 'Traction', fields: ['fTractionCurveMax', 'fTractionCurveMin', 'fTractionCurveLateral', 'fTractionSpringDeltaMax', 'fLowSpeedTractionLossMult', 'fTractionBiasFront', 'fTractionLossMult'] },
  suspension: { title: 'Suspension', presetsCategory: 'Suspension', fields: ['fSuspensionForce', 'fSuspensionCompDamp', 'fSuspensionReboundDamp', 'fSuspensionUpperLimit', 'fSuspensionLowerLimit', 'fSuspensionRaise', 'fSuspensionBiasFront', 'fAntiRollBarForce', 'fAntiRollBarBiasFront'] },
  drivetrain: { title: 'Drivetrain', fields: ['fDriveBiasFront'],
    radio: { label: 'Drive layout', field: 'fDriveBiasFront', hint: '0 = rear-wheel drive · 1 = front-wheel drive · 0.5 = all-wheel drive.', options: [{ label: 'RWD', value: '0.000000' }, { label: 'AWD', value: '0.500000' }, { label: 'FWD', value: '1.000000' }] } },
  damage: { title: 'Damage', presetsCategory: 'Damage', fields: ['fCollisionDamageMult', 'fEngineDamageMult', 'fDeformationDamageMult', 'fWeaponDamageMult'] },
};

function PhysicsTab({ root, handlingId, config, onChanged, onGoHandling }: { root: string; handlingId: string; config: PhysicsConfig; onChanged: () => void; onGoHandling: () => void }) {
  const [fields, setFields] = useState<VSHandlingField[]>([]);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<{ id: string; name?: string; changes: { name: string; from: string; to: string }[] } | null>(null);
  const [busyPreset, setBusyPreset] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await window.electronAPI.vehicleStudio.readHandling(root, handlingId);
    setLoading(false);
    if (!r.ok || !r.fields) { setReadError(r.error || 'Could not read handling'); return; }
    setReadError(null); setFields(r.fields);
    const o: Record<string, string> = {};
    for (const f of r.fields) if (f.value !== undefined) o[f.name] = f.value;
    setOrig(o); setEdits({}); setPreview(null);
  };
  React.useEffect(() => { load(); if (config.presetsCategory) window.electronAPI.vehicleStudio.categoryPresets(config.presetsCategory).then(setPresets); else setPresets([]); }, [root, handlingId, config.title]);

  const val = (k: string) => (k in edits ? edits[k] : orig[k]) ?? '';
  const setVal = (k: string, v: string) => setEdits((e) => ({ ...e, [k]: v }));
  const resetField = (k: string) => setEdits((e) => { const n = { ...e }; delete n[k]; return n; });
  const dirty = Object.keys(edits).filter((k) => edits[k] !== orig[k]);

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    const r = await window.electronAPI.vehicleStudio.writeHandling(root, handlingId, dirty.map((k) => ({ name: k, value: edits[k] })));
    setSaving(false);
    if (r.ok) { toast.success(`Saved ${r.applied} field(s)`); await load(); onChanged(); } else toast.error(r.error || 'Save failed');
  };
  const undo = async () => { const r = await window.electronAPI.vehicleStudio.undoHandling(root, handlingId); if (r.ok) { toast.success('Reverted last save'); await load(); onChanged(); } else toast.error(r.error || 'Nothing to undo'); };
  const openPreset = async (id: string) => {
    setBusyPreset(true);
    const p = await window.electronAPI.vehicleStudio.previewCategoryPreset(root, handlingId, config.presetsCategory!, id);
    setBusyPreset(false);
    if (!p.ok) { toast.error(p.error || 'Preview failed'); return; }
    setPreview({ id, name: p.name, changes: p.changes || [] });
  };
  const applyPreset = async () => {
    if (!preview) return;
    setBusyPreset(true);
    const r = await window.electronAPI.vehicleStudio.applyCategoryPreset(root, handlingId, config.presetsCategory!, preview.id);
    setBusyPreset(false);
    if (r.ok) { toast.success(`Applied ${preview.name} (${r.applied} fields)`); setPreview(null); await load(); onChanged(); } else toast.error(r.error || 'Apply failed');
  };

  if (loading) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Reading handling…</div>;
  if (readError) return (
    <div className="card flex flex-col items-center py-14 text-center max-w-xl">
      <AlertTriangle size={28} className="text-amber-400 mb-3" />
      <p className="text-sm font-bold text-surface-100">Handling not available</p>
      <p className="text-xs text-surface-500 mt-1 max-w-sm">This vehicle's handling entry is missing — repair it in the Handling tab, then this editor works.</p>
      <button onClick={onGoHandling} className="btn-primary text-xs py-2 mt-4 flex items-center gap-1.5"><Gauge size={13} /> Go to Handling</button>
    </div>
  );

  const present = (n: string) => fields.some((f) => f.name === n);
  const shownFields = config.fields.filter(present);
  const radio = config.radio;
  const derived = (config.derived || []).filter((d) => present(d.field));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-surface-100 flex-1">{config.title}</p>
        {dirty.length > 0 && <span className="text-[11px] text-primary-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" /> {dirty.length} unsaved</span>}
        <button onClick={undo} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"><Undo2 size={13} /> Undo</button>
        <button onClick={save} disabled={saving || !dirty.length} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save{dirty.length ? ` (${dirty.length})` : ''}</button>
      </div>

      {presets.length > 0 && (
        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Presets</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => <button key={p.id} onClick={() => openPreset(p.id)} disabled={busyPreset}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${preview?.id === p.id ? 'bg-primary-500/15 text-primary-200 border-primary-500/30' : 'bg-overlay-3 text-surface-200 border-overlay-6 hover:bg-primary-600 hover:text-white'}`}>{p.name}</button>)}
          </div>
          {preview && (
            <div className="mt-3 rounded-lg border border-primary-500/25 bg-primary-500/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-primary-200">{preview.name} — preview</p>
                <div className="flex gap-2">
                  <button onClick={() => setPreview(null)} className="btn-secondary text-[11px] py-1">Cancel</button>
                  <button onClick={applyPreset} disabled={busyPreset || !preview.changes.length} className="btn-primary text-[11px] py-1">Apply</button>
                </div>
              </div>
              {preview.changes.length === 0 ? <p className="text-xs text-surface-500">Already matches this preset — no changes.</p> : (
                <div className="space-y-1">{preview.changes.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs"><span className="font-mono text-surface-400 flex-1 truncate">{friendly(c.name)}</span><span className="text-surface-500">{parseFloat(c.from)}</span><ChevronRight size={11} className="text-surface-600" /><span className="text-emerald-300 font-semibold">{parseFloat(c.to)}</span></div>
                ))}</div>
              )}
            </div>
          )}
        </div>
      )}

      {radio && present(radio.field) && (
        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">{radio.label}</p>
          <div className="flex gap-2">
            {radio.options.map((o) => {
              const active = parseFloat(val(radio.field) || '0').toFixed(2) === parseFloat(o.value).toFixed(2);
              return <button key={o.label} onClick={() => setVal(radio.field, o.value)} className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-all ${active ? 'bg-primary-500/15 text-primary-200 border-primary-500/30' : 'bg-overlay-3 text-surface-300 border-overlay-6 hover:bg-overlay-6'}`}>{o.label}</button>;
            })}
          </div>
          {radio.hint && <p className="text-[10px] text-surface-600 mt-2">{radio.hint}</p>}
        </div>
      )}

      {derived.length > 0 && (
        <div className="card space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-surface-500">Quick controls</p>
          {derived.map((d) => {
            const raw = parseFloat(val(d.field) || '0');
            return (
              <div key={d.field}>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-surface-300 flex-1">{d.label}{d.hint && <span className="text-surface-600"> · {d.hint}</span>}</label>
                  <input value={d.toDisplay(raw)} onChange={(e) => setVal(d.field, d.fromDisplay(e.target.value))} className="w-24 bg-overlay-3 border border-overlay-6 rounded-lg px-2 py-1 text-xs text-right text-surface-100 focus:outline-none focus:border-primary-500/40" />
                  {d.unit && <span className="text-[10px] text-surface-500 w-8">{d.unit}</span>}
                </div>
                <p className="text-[10px] text-surface-600 font-mono mt-0.5">{d.field} = {val(d.field)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Values <span className="text-surface-600 normal-case">— advanced</span></p>
        <div className="space-y-2.5">
          {shownFields.length === 0 ? <p className="text-xs text-surface-500">None of these fields exist in this vehicle's handling.</p> : shownFields.map((name) => {
            const isDirty = (name in edits) && edits[name] !== orig[name];
            return (
              <div key={name}>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-surface-200 flex-1 truncate" title={TIPS[name] || name}>{friendly(name)} {isDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-400 ml-1" />}</label>
                  <input value={val(name)} onChange={(e) => setVal(name, e.target.value)} spellCheck={false} className={`w-28 bg-overlay-3 border rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none ${isDirty ? 'border-primary-500/50 text-primary-200' : 'border-overlay-6 text-surface-200'}`} />
                  <button onClick={() => resetField(name)} disabled={!isDirty} title="Reset to last saved" className={`text-surface-500 hover:text-surface-200 ${!isDirty ? 'opacity-30' : ''}`}><RotateCcw size={12} /></button>
                </div>
                <div className="flex items-start gap-2 mt-0.5">
                  <p className="text-[10px] text-surface-600 font-mono shrink-0">{name}{isDirty ? ` · was ${orig[name]}` : ''}</p>
                  {TIPS[name] && <p className="text-[10px] text-surface-500 flex-1 truncate">{TIPS[name]}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ Structured metadata editors (vehicles/carvariations/carcols) ═══════════════════ */
const META_TIPS: Record<string, string> = {
  handlingId: 'Which handling entry (in handling.meta) this vehicle uses.',
  vehicleClass: 'GTA class (VC_SPORT, VC_EMERGENCY, …) — affects category & AI.',
  type: 'VEHICLE_TYPE_CAR / _BIKE / _HELI etc.',
  flags: 'Space-separated FLAG_* behaviour flags.',
  layout: 'Seating/entry layout (LAYOUT_*).',
  audioNameHash: 'Which vehicle the engine sound is copied from.',
  wheelType: 'Default wheel category (VWT_SPORT, VWT_MUSCLE, …).',
  sirenSettings: 'The carcols siren ID this vehicle uses (links to carcols.meta).',
  lightSettings: 'The light configuration ID.',
};
function MetaEditor({ root, kind, modelName, title, onChanged }: { root: string; kind: 'vehicles' | 'carvariations' | 'carcols'; modelName: string; title: string; onChanged: () => void }) {
  const [fields, setFields] = useState<VSMetaField[]>([]);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [handlingNames, setHandlingNames] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    const r = await window.electronAPI.vehicleStudio.readMeta(root, kind, modelName);
    setLoading(false);
    if (!r.ok || !r.fields) { setReadError(r.error || `${kind}.meta not found for ${modelName}`); return; }
    setReadError(null); setFields(r.fields); setSummary(r.summary || null);
    const o: Record<string, string> = {}; for (const f of r.fields) o[f.tag] = f.value;
    setOrig(o); setEdits({});
  };
  React.useEffect(() => { load(); if (kind === 'vehicles') window.electronAPI.vehicleStudio.listHandling(root).then((l) => setHandlingNames(l.map((e) => e.name))); }, [root, kind, modelName]);

  const val = (k: string) => (k in edits ? edits[k] : orig[k]) ?? '';
  const setVal = (k: string, v: string) => setEdits((e) => ({ ...e, [k]: v }));
  const resetField = (k: string) => setEdits((e) => { const n = { ...e }; delete n[k]; return n; });
  const dirty = Object.keys(edits).filter((k) => edits[k] !== orig[k]);

  const save = async () => {
    const editable = new Set(fields.filter((f) => f.editable).map((f) => f.tag));
    const changes = dirty.filter((k) => editable.has(k)).map((k) => ({ tag: k, value: edits[k] }));
    if (!changes.length) return;
    setSaving(true);
    const r = await window.electronAPI.vehicleStudio.writeMeta(root, kind, modelName, changes);
    setSaving(false);
    if (r.ok) { toast.success(`Saved ${r.applied} field(s) to ${kind}.meta`); await load(); onChanged(); } else toast.error(r.error || 'Save failed');
  };
  const undo = async () => { const r = await window.electronAPI.vehicleStudio.undoMeta(root, kind, modelName); if (r.ok) { toast.success('Reverted last save'); await load(); onChanged(); } else toast.error(r.error || 'Nothing to undo'); };

  if (loading) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Reading {kind}.meta…</div>;
  if (readError) return (
    <div className="card flex flex-col items-center py-14 text-center max-w-xl">
      <FileCode size={28} className="text-surface-600 mb-3" />
      <p className="text-sm font-bold text-surface-100">No {title.toLowerCase()} for this vehicle</p>
      <p className="text-xs text-surface-500 mt-1 max-w-sm">{readError}. This is normal if the resource doesn't include a {kind}.meta entry for {modelName}.</p>
    </div>
  );

  const handlingVal = kind === 'vehicles' ? val('handlingId') : null;
  const handlingValid = handlingVal == null ? null : handlingNames.some((n) => n.toUpperCase() === handlingVal.toUpperCase());
  const match = (f: VSMetaField) => !search || f.friendly.toLowerCase().includes(search.toLowerCase()) || f.tag.toLowerCase().includes(search.toLowerCase());
  const shown = fields.filter(match);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-surface-100 flex-1">{title} <span className="text-[11px] text-surface-500 font-normal font-mono">· {modelName}</span></p>
        {dirty.length > 0 && <span className="text-[11px] text-primary-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" /> {dirty.length} unsaved</span>}
        <button onClick={undo} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"><Undo2 size={13} /> Undo</button>
        <button onClick={save} disabled={saving || !dirty.length} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save{dirty.length ? ` (${dirty.length})` : ''}</button>
      </div>

      {/* cross-file handling reference validity (vehicles.meta) */}
      {handlingVal != null && (
        <div className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-2 ${handlingValid ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-red-500/25 bg-red-500/10 text-red-300'}`}>
          {handlingValid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {handlingValid ? `Valid handling reference — "${handlingVal}" exists in handling.meta` : `Broken handling reference — "${handlingVal}" is not in handling.meta`}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fields… (handling, class, siren…)"
          className="w-full bg-overlay-3 border border-overlay-6 rounded-xl pl-9 pr-3 py-2 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/40" />
      </div>

      <div className="card">
        <div className="space-y-2.5">
          {shown.length === 0 ? <p className="text-xs text-surface-500">No matching fields.</p> : shown.map((f) => {
            const isDirty = (f.tag in edits) && edits[f.tag] !== orig[f.tag];
            return (
              <div key={f.tag}>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-surface-200 flex-1 truncate" title={META_TIPS[f.tag] || f.tag}>{f.friendly} {isDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-400 ml-1" />}</label>
                  {f.editable ? (
                    <input value={val(f.tag)} onChange={(e) => setVal(f.tag, e.target.value)} spellCheck={false} className={`w-44 bg-overlay-3 border rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none ${isDirty ? 'border-primary-500/50 text-primary-200' : 'border-overlay-6 text-surface-200'}`} />
                  ) : (
                    <span className="w-44 text-right text-xs font-mono text-surface-500 flex items-center justify-end gap-1.5">{f.value} <span className="text-[9px] px-1 py-0.5 rounded bg-overlay-4 border border-overlay-6">read-only</span></span>
                  )}
                  {f.editable && <button onClick={() => resetField(f.tag)} disabled={!isDirty} title="Reset to last saved" className={`text-surface-500 hover:text-surface-200 ${!isDirty ? 'opacity-30' : ''}`}><RotateCcw size={12} /></button>}
                </div>
                <p className="text-[10px] text-surface-600 font-mono mt-0.5">{f.kind === 'attr' ? `<${f.tag} value="…" />` : `<${f.tag}>…</${f.tag}>`}{isDirty ? ` · was ${orig[f.tag]}` : ''}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* carvariations read-only summary */}
      {summary && (
        <div className="card">
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Variation data <span className="normal-case text-surface-600">— read-only</span></p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><p className="text-[9px] uppercase tracking-wider text-surface-600">Colour combos</p><p className="text-surface-200 font-semibold">{summary.colorCombos}</p></div>
            <div><p className="text-[9px] uppercase tracking-wider text-surface-600">Liveries</p><p className="text-surface-200 font-semibold">{summary.liveries}</p></div>
            <div><p className="text-[9px] uppercase tracking-wider text-surface-600">Mod kits</p><p className="text-surface-200 font-semibold truncate">{(summary.kits || []).join(', ') || '—'}</p></div>
          </div>
          <p className="text-[10px] text-surface-600 mt-2">Colour arrays, liveries and kits are preserved exactly — structured editing for these comes in a later phase (kept read-only rather than risk corrupting the arrays).</p>
        </div>
      )}

      <p className="text-[10px] text-surface-600">Edits are surgical — only the field you change is rewritten. Unknown elements, attributes and comments are preserved, and a backup is saved before every write.</p>
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

/* ═══════════════════ Health score ═══════════════════ */
export function healthScore(s: { errors: number; warnings: number }): number {
  return Math.max(0, 100 - s.errors * 15 - s.warnings * 5);
}
function HealthBar({ summary }: { summary: { errors: number; warnings: number; info: number } }) {
  const score = healthScore(summary);
  const tone = score >= 90 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const txt = score >= 90 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-surface-500">Resource Health</p>
        <span className={`text-lg font-extrabold ${txt}`}>{score}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-overlay-4 overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs">
        <span className="text-red-400">{summary.errors} Critical</span>
        <span className="text-amber-400">{summary.warnings} Warnings</span>
        <span className="text-sky-400">{summary.info} Info</span>
        {score === 100 && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> All references valid</span>}
      </div>
    </div>
  );
}

/* ═══════════════════ Handling reference repair (§1-3, 25, 42-45) ═══════════════════ */
function HandlingRepair({ root, handlingId, modelName, onFixed, onGoDiagnostics }: {
  root: string; handlingId: string; modelName: string; onFixed: () => void; onGoDiagnostics: () => void;
}) {
  const [diag, setDiag] = useState<VSHandlingDiag | null>(null);
  const [busy, setBusy] = useState(false);
  const [cloneFrom, setCloneFrom] = useState('');

  const run = () => window.electronAPI.vehicleStudio.diagnoseHandling(root, handlingId).then((d) => { setDiag(d); setCloneFrom(d.fuzzy[0]?.name || d.allNames[0]?.name || ''); });
  React.useEffect(() => { run(); }, [root, handlingId]);

  const wrap = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true); const r = await fn(); setBusy(false);
    if (r.ok) { toast.success(okMsg); onFixed(); } else toast.error(r.error || 'Failed');
  };

  if (!diag) return <div className="flex items-center gap-2 text-sm text-surface-500"><Loader2 size={14} className="animate-spin" /> Tracing handling reference…</div>;

  const chain = [
    { ok: true, label: `vehicles.meta references "${modelName}"` },
    { ok: true, label: `handlingId = ${handlingId}` },
    { ok: diag.handlingFileExists, label: diag.handlingFileExists ? 'handling.meta found' : 'handling.meta NOT found' },
    { ok: diag.registeredInManifest !== false, label: diag.registeredInManifest === false ? 'handling.meta NOT registered in manifest' : 'handling.meta registered' },
    { ok: !!diag.exactMatch, label: diag.exactMatch ? `entry "${diag.exactMatch.name}" found` : `entry "${handlingId}" MISSING` },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm font-bold text-red-300 flex items-center gap-2"><XCircle size={16} /> Handling reference error</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs">
          <div><span className="text-surface-500">Vehicle:</span> <span className="text-surface-100 font-semibold">{modelName}</span></div>
          <div><span className="text-surface-500">Referenced handling:</span> <span className="text-surface-100 font-semibold">{handlingId}</span></div>
        </div>
        <p className="text-xs text-surface-300 mt-2">No matching handling entry was found. Possible causes: handling.meta missing, a differently-spelled handling ID, handling.meta not registered in fxmanifest.lua, wrong location, or an unparseable entry.</p>
      </div>

      {/* Dependency trace (§25, §28) */}
      <div className="card">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">Find cause — reference trace</p>
        <div className="space-y-1">
          {chain.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {c.ok ? <CheckCircle2 size={13} className="text-emerald-400" /> : <XCircle size={13} className="text-red-400" />}
              <span className={c.ok ? 'text-surface-300' : 'text-red-300 font-semibold'}>{c.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-primary-300 mt-2">
          Cause: {!diag.handlingFileExists ? 'no handling.meta in the resource.' : diag.registeredInManifest === false ? 'handling.meta is not registered in the manifest.' : `handling.meta has no entry named "${handlingId}".`}
        </p>
      </div>

      {/* Fixes */}
      <div className="card space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-surface-500">Repair options</p>

        {diag.registeredInManifest === false && diag.handlingFileExists && (
          <RepairRow title="Register handling.meta in the manifest" desc="Adds the data_file 'HANDLING_FILE' line so the game loads it." btn="Register"
            onClick={() => wrap(() => window.electronAPI.vehicleStudio.registerHandling(root), 'Registered handling.meta')} busy={busy} />
        )}

        {diag.fuzzy.length > 0 && (
          <div>
            <p className="text-xs text-surface-400 mb-1.5">Close matches found — point this vehicle at one:</p>
            <div className="space-y-1.5">
              {diag.fuzzy.map((f) => (
                <div key={f.name} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-overlay-4 bg-overlay-2">
                  <span className="text-sm font-mono text-surface-100 flex-1">{f.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${f.similarity >= 90 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{f.similarity}%</span>
                  <button disabled={busy} onClick={() => wrap(() => window.electronAPI.vehicleStudio.setVehicleHandlingId(root, modelName, f.name), `Pointed ${modelName} at ${f.name}`)}
                    className="btn-secondary text-[11px] py-1">Use {f.name}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <RepairRow title={`Create a new handling entry "${handlingId}"`} desc="Generates a complete, valid handling entry you can then tune." btn="Create"
          onClick={() => wrap(() => window.electronAPI.vehicleStudio.createHandling(root, handlingId), `Created handling "${handlingId}"`)} busy={busy} />

        {diag.allNames.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <p className="text-xs text-surface-400 mb-1">Or clone an existing entry as "{handlingId}":</p>
              <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)} className="w-full bg-overlay-3 border border-overlay-6 rounded-lg px-2 py-1.5 text-xs text-surface-200 focus:outline-none">
                {diag.allNames.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
              </select>
            </div>
            <button disabled={busy || !cloneFrom} onClick={() => wrap(() => window.electronAPI.vehicleStudio.cloneHandling(root, cloneFrom, handlingId), `Cloned ${cloneFrom} → ${handlingId}`)}
              className="btn-secondary text-xs py-2">Clone</button>
          </div>
        )}

        <button onClick={onGoDiagnostics} className="text-xs text-primary-300 hover:text-primary-200">Open Diagnostics →</button>
      </div>
    </div>
  );
}
function RepairRow({ title, desc, btn, onClick, busy }: { title: string; desc: string; btn: string; onClick: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-overlay-4 bg-overlay-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-surface-100">{title}</p>
        <p className="text-[11px] text-surface-500">{desc}</p>
      </div>
      <button disabled={busy} onClick={onClick} className="btn-primary text-[11px] py-1.5 shrink-0">{busy ? <Loader2 size={12} className="animate-spin" /> : btn}</button>
    </div>
  );
}

function TuneMissing({ modelName, handlingId, onGoHandling }: { modelName: string; handlingId: string; onGoHandling: () => void }) {
  return (
    <div className="card flex flex-col items-center py-14 text-center max-w-xl">
      <AlertTriangle size={30} className="text-amber-400 mb-3" />
      <p className="text-sm font-bold text-surface-100">Can't tune — handling is missing</p>
      <p className="text-xs text-surface-500 mt-1 max-w-sm">{modelName} references handling "{handlingId}", but no matching entry exists yet. Repair it first, then Smart Tune will work.</p>
      <button onClick={onGoHandling} className="btn-primary text-xs py-2 mt-4 flex items-center gap-1.5"><Gauge size={13} /> Repair in Handling tab</button>
    </div>
  );
}
