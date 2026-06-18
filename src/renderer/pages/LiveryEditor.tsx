import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Eye, EyeOff, Trash2, ChevronUp, ChevronDown, Download, Palette, ZoomIn, ZoomOut,
  Plus, Car, Grid3x3, Type, Brush, MousePointer, Layers as LayersIcon,
  FolderOpen, Box, Loader2, ChevronLeft, Wand2, Square, Stethoscope, X,
  CheckCircle2, XCircle, FileText, Image as ImageIcon,
} from 'lucide-react';
import { ddsToImageData, extractTexturesFromYTD } from '../services/ytdParser';
import { loadVehicle, type DetectedVehicle, type LoadStage, type VehicleDiagnostics } from '../services/vehicleResourceLoader';
import type { VehicleTexture } from '../services/rage/ytd';
import type { LoadedVehicle } from '../services/glbVehicle';
import { VehicleViewer } from '../services/vehicleViewer';
import { EXPORTERS, downloadResult } from '../services/liveryExport';

// ── Layer model ─────────────────────────────────────────────────────────────
type LayerKind = 'base' | 'image' | 'paint' | 'text' | 'fill';
interface Layer {
  id: string; name: string; kind: LayerKind; visible: boolean; opacity: number;
  blendMode: GlobalCompositeOperation; canvas: HTMLCanvasElement;
  x: number; y: number; w: number; h: number;
  text?: string; fontSize?: number; color?: string;
}
interface TargetEdit { layers: Layer[]; canvas: HTMLCanvasElement; w: number; h: number; }
interface EditTarget { id: string; name: string; format: string; w: number; h: number; base: ImageData | null; }

const BLEND_MODES: GlobalCompositeOperation[] = [
  'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'hard-light', 'soft-light', 'difference', 'exclusion',
];

function newCanvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function uid() { return Math.random().toString(36).slice(2); }
function canvasFromImageData(id: ImageData) { const c = newCanvas(id.width, id.height); c.getContext('2d')!.putImageData(id, 0, 0); return c; }
function renderTextLayer(l: Layer) {
  const ctx = l.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, l.canvas.width, l.canvas.height);
  ctx.fillStyle = l.color || '#fff';
  ctx.font = `bold ${l.fontSize || 80}px Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(l.text || 'TEXT', 20, 20);
}

type Phase = 'empty' | 'list' | 'loading' | 'edit';

export default function LiveryEditor() {
  const [phase, setPhase] = useState<Phase>('empty');
  const [vehicles, setVehicles] = useState<DetectedVehicle[]>([]);
  const [folderName, setFolderName] = useState('');
  const [activeVehicle, setActiveVehicle] = useState<DetectedVehicle | null>(null);
  const [loadStage, setLoadStage] = useState<string>('');
  const [targets, setTargets] = useState<EditTarget[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<LoadedVehicle | null>(null);
  const [geomReason, setGeomReason] = useState<string | undefined>();
  const [diagnostics, setDiagnostics] = useState<VehicleDiagnostics | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [showAllTex, setShowAllTex] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'brush'>('select');
  const [brushColor, setBrushColor] = useState('#ff3344');
  const [brushSize, setBrushSize] = useState(24);
  const [zoom, setZoom] = useState(0.4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [exporterId, setExporterId] = useState('png');
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const edits = useRef<Map<string, TargetEdit>>(new Map());
  const centerCanvas = useRef<HTMLCanvasElement>(null);
  const viewerMount = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<VehicleViewer | null>(null);
  const texInput = useRef<HTMLInputElement>(null);
  const painting = useRef(false);
  const panning = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });

  // Geometry viewer only mounts when we actually have a real model.
  useEffect(() => {
    if (geometry && viewerMount.current && !viewerRef.current) {
      const v = new VehicleViewer(viewerMount.current);
      v.setVehicle(geometry);
      viewerRef.current = v;
    }
    return () => { viewerRef.current?.dispose(); viewerRef.current = null; };
  }, [geometry]);

  // ── Folder workflow ──────────────────────────────────────────────────────────
  const openFolder = useCallback(async () => {
    const dir = await window.electronAPI.livery.pickFolder();
    if (!dir) return;
    try {
      const res = await window.electronAPI.livery.scanFolder(dir);
      if (!res.vehicles.length) { toast.error('No .yft/.ytd vehicle files found in that folder'); return; }
      setVehicles(res.vehicles);
      setFolderName(res.root.split(/[\\/]/).pop() || res.root);
      setPhase('list');
    } catch (e: any) {
      toast.error(e?.message || 'Scan failed');
    }
  }, []);

  const selectVehicle = useCallback(async (v: DetectedVehicle) => {
    setActiveVehicle(v);
    setPhase('loading');
    setGeometry(null); setGeomReason(undefined);
    edits.current.clear();
    const stageText: Record<LoadStage, string> = {
      scanning: 'Scanning files…', reading: 'Reading model…',
      textures: 'Reading textures…', geometry: 'Building preview…', done: 'Done',
    };
    try {
      const result = await loadVehicle(v, (s) => setLoadStage(stageText[s] || ''));
      const tg: EditTarget[] = result.textures.map((t: VehicleTexture, i) => ({
        id: `tex_${i}`, name: t.name, format: t.format, w: t.width, h: t.height, base: t.imageData,
      }));
      setTargets(tg);
      setGeometry(result.geometry);
      setGeomReason(result.geometryReason);
      setDiagnostics(result.diagnostics);
      setPhase('edit');
      if (tg.length) {
        setTimeout(() => selectTarget(tg[0].id, tg), 0);
      } else {
        // Never fail silently — surface the diagnostics so we can see why.
        setShowAllTex(true);
        setShowDiag(true);
        toast('No editable textures decoded — opening diagnostics', { icon: '🔬' });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Load failed');
      setPhase('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Editing core (per texture target) ────────────────────────────────────────
  function ensureEdit(t: EditTarget): TargetEdit {
    let e = edits.current.get(t.id);
    if (e) return e;
    const layers: Layer[] = [];
    if (t.base) layers.push({
      id: uid(), name: 'Base texture', kind: 'base', visible: true, opacity: 100,
      blendMode: 'source-over', canvas: canvasFromImageData(t.base), x: 0, y: 0, w: t.w, h: t.h,
    });
    e = { layers, canvas: newCanvas(t.w, t.h), w: t.w, h: t.h };
    edits.current.set(t.id, e);
    composite(t.id);
    return e;
  }

  function targetById(id: string | null, list = targets) { return list.find((t) => t.id === id) || null; }

  function composite(id: string) {
    const e = edits.current.get(id); if (!e) return;
    const ctx = e.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, e.w, e.h);
    for (const l of e.layers) {
      if (!l.visible) continue;
      ctx.save(); ctx.globalAlpha = l.opacity / 100; ctx.globalCompositeOperation = l.blendMode;
      ctx.drawImage(l.canvas, l.x, l.y, l.w, l.h); ctx.restore();
    }
    if (id === selected) drawCenter(e);
  }

  function drawCenter(e: TargetEdit) {
    const cv = centerCanvas.current; if (!cv) return;
    cv.width = e.w; cv.height = e.h;
    const ctx = cv.getContext('2d')!;
    const pat = newCanvas(16, 16); const pc = pat.getContext('2d')!;
    pc.fillStyle = '#1a1c26'; pc.fillRect(0, 0, 16, 16);
    pc.fillStyle = '#232533'; pc.fillRect(0, 0, 8, 8); pc.fillRect(8, 8, 8, 8);
    ctx.fillStyle = ctx.createPattern(pat, 'repeat')!; ctx.fillRect(0, 0, e.w, e.h);
    ctx.drawImage(e.canvas, 0, 0);
  }

  function selectTarget(id: string, list = targets) {
    const t = targetById(id, list); if (!t) return;
    setSelected(id);
    const e = ensureEdit(t);
    setActiveLayerId(e.layers[e.layers.length - 1]?.id ?? null);
    requestAnimationFrame(() => drawCenter(e));
    rerender();
  }

  // ── Imports / layers ─────────────────────────────────────────────────────────
  const importTexture = useCallback(async (file: File) => {
    const t = targetById(selected); if (!t) { toast.error('Select a texture first'); return; }
    const e = ensureEdit(t);
    const name = file.name.toLowerCase();
    try {
      let id: ImageData | null = null;
      if (name.endsWith('.dds')) id = ddsToImageData(new Uint8Array(await file.arrayBuffer()));
      else if (name.endsWith('.ytd')) { const tx = await extractTexturesFromYTD(await file.arrayBuffer()); if (tx.length) id = ddsToImageData(tx[0].ddsBytes); }
      else if (name.match(/\.(png|jpe?g|webp|bmp)$/)) {
        const img = await loadImage(file); const c = newCanvas(img.naturalWidth, img.naturalHeight);
        c.getContext('2d')!.drawImage(img, 0, 0);
        addLayer(e, t.id, { kind: 'image', name: file.name, canvas: c, w: img.naturalWidth, h: img.naturalHeight });
        toast.success(`Added ${file.name}`); return;
      } else { toast.error('Supported: .dds .ytd .png .jpg'); return; }
      if (!id) { toast.error('Could not decode texture'); return; }
      addLayer(e, t.id, { kind: 'image', name: file.name, canvas: canvasFromImageData(id), w: id.width, h: id.height });
      toast.success(`Added ${file.name}`);
    } catch (err: any) { toast.error(err?.message || 'Import failed'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, targets]);

  function addLayer(e: TargetEdit, id: string, p: Partial<Layer> & { kind: LayerKind; canvas: HTMLCanvasElement; w: number; h: number }) {
    const l: Layer = { id: uid(), name: p.name || p.kind, visible: true, opacity: 100, blendMode: 'source-over', x: 0, y: 0, ...p } as Layer;
    e.layers.push(l); setActiveLayerId(l.id); composite(id); rerender();
  }
  function addTextLayer() {
    const t = targetById(selected); if (!t) return; const e = ensureEdit(t);
    const c = newCanvas(e.w, e.h);
    const l: Layer = { id: uid(), name: 'Text', kind: 'text', visible: true, opacity: 100, blendMode: 'source-over', canvas: c, x: 0, y: 0, w: e.w, h: e.h, text: 'TEXT', fontSize: Math.round(e.h / 12), color: '#ffffff' };
    renderTextLayer(l); e.layers.push(l); setActiveLayerId(l.id); composite(t.id); rerender();
  }
  function addFillLayer() {
    const t = targetById(selected); if (!t) return; const e = ensureEdit(t);
    const c = newCanvas(e.w, e.h); const ctx = c.getContext('2d')!; ctx.fillStyle = brushColor; ctx.fillRect(0, 0, e.w, e.h);
    addLayer(e, t.id, { kind: 'fill', name: 'Fill', canvas: c, w: e.w, h: e.h, opacity: 60 });
  }
  function ensurePaintLayer(e: TargetEdit): Layer {
    let l = e.layers.find((x) => x.id === activeLayerId && x.kind === 'paint');
    if (!l) { l = { id: uid(), name: 'Paint', kind: 'paint', visible: true, opacity: 100, blendMode: 'source-over', canvas: newCanvas(e.w, e.h), x: 0, y: 0, w: e.w, h: e.h }; e.layers.push(l); setActiveLayerId(l.id); rerender(); }
    return l;
  }
  function updateLayer(id: string, changes: Partial<Layer>) {
    const e = edits.current.get(selected || ''); if (!e) return;
    const l = e.layers.find((x) => x.id === id); if (!l) return;
    Object.assign(l, changes); if (l.kind === 'text') renderTextLayer(l); composite(selected!); rerender();
  }
  function deleteLayer(id: string) {
    const e = edits.current.get(selected || ''); if (!e) return;
    e.layers = e.layers.filter((l) => l.id !== id);
    if (activeLayerId === id) setActiveLayerId(e.layers[e.layers.length - 1]?.id ?? null);
    composite(selected!); rerender();
  }
  function moveLayer(id: string, dir: -1 | 1) {
    const e = edits.current.get(selected || ''); if (!e) return;
    const i = e.layers.findIndex((l) => l.id === id); const j = i + dir;
    if (j < 0 || j >= e.layers.length) return;
    [e.layers[i], e.layers[j]] = [e.layers[j], e.layers[i]]; composite(selected!); rerender();
  }

  // ── Canvas interaction ───────────────────────────────────────────────────────
  function canvasPoint(ev: React.PointerEvent) {
    const cv = centerCanvas.current; if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * cv.width, y: ((ev.clientY - r.top) / r.height) * cv.height };
  }
  function paintAt(ev: React.PointerEvent) {
    const e = edits.current.get(selected || ''); if (!e) return;
    const l = ensurePaintLayer(e); const p = canvasPoint(ev); if (!p) return;
    const ctx = l.canvas.getContext('2d')!; ctx.fillStyle = brushColor;
    ctx.beginPath(); ctx.arc(p.x, p.y, brushSize, 0, Math.PI * 2); ctx.fill(); composite(selected!);
  }
  const onPointerDown = (ev: React.PointerEvent) => {
    if (ev.button === 1 || ev.altKey || tool === 'select') { panning.current = true; lastPt.current = { x: ev.clientX, y: ev.clientY }; }
    else if (tool === 'brush') { painting.current = true; paintAt(ev); }
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (panning.current) { setPan((p) => ({ x: p.x + ev.clientX - lastPt.current.x, y: p.y + ev.clientY - lastPt.current.y })); lastPt.current = { x: ev.clientX, y: ev.clientY }; }
    else if (painting.current) paintAt(ev);
  };
  const onPointerUp = () => { panning.current = false; painting.current = false; };
  const onWheel = (ev: React.WheelEvent) => setZoom((z) => Math.max(0.05, Math.min(5, z * (ev.deltaY > 0 ? 0.9 : 1.1))));

  async function doExport() {
    const e = edits.current.get(selected || ''); const exporter = EXPORTERS.find((x) => x.id === exporterId);
    if (!e || !exporter) { toast.error('Nothing to export'); return; }
    if (!exporter.ready) { toast.error(exporter.label + ' not available yet'); return; }
    try {
      const t = targetById(selected);
      const base = `${activeVehicle?.name || 'livery'}_${t?.name || 'texture'}`.replace(/[^\w.-]+/g, '_');
      const res = await exporter.export(e.canvas, base);
      downloadResult(res); toast.success(`Exported ${res.filename}`);
    } catch (err: any) { toast.error(err?.message || 'Export failed'); }
  }

  // Live-update the texture onto the real model when geometry exists.
  useEffect(() => {
    if (!geometry || !viewerRef.current || !selected) return;
    const e = edits.current.get(selected);
    const slot = geometry.slots[0];
    if (e && slot) viewerRef.current.setSlotTexture(slot, e.canvas);
  }, [geometry, selected]);

  const curEdit = selected ? edits.current.get(selected) : null;
  const curTarget = targetById(selected);
  const activeLayer = curEdit?.layers.find((l) => l.id === activeLayerId) || null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-overlay-6 bg-surface-950/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-500/25 flex items-center justify-center"><Palette size={16} className="text-pink-400" /></div>
          <div>
            <h1 className="text-sm font-bold text-surface-100">Livery Editor</h1>
            <p className="text-[10px] text-surface-500">{activeVehicle ? `${activeVehicle.name} · ${targets.length} textures` : 'Open a vehicle resource folder'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {phase !== 'empty' && (
            <button onClick={() => setPhase('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary"><ChevronLeft size={12} /> Vehicles</button>
          )}
          <button onClick={openFolder} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary"><FolderOpen size={12} /> Open Vehicle Folder</button>
          {(phase === 'edit' || phase === 'list') && diagnostics && (
            <button onClick={() => setShowDiag(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-600/15 text-cyan-300 border border-cyan-500/25 rounded-lg hover:bg-cyan-600/25 transition-all"><Stethoscope size={12} /> Diagnostics</button>
          )}
          {phase === 'edit' && (
            <div className="flex items-center rounded-lg overflow-hidden border border-pink-500/30">
              <select value={exporterId} onChange={(e) => setExporterId(e.target.value)} className="px-2 py-1.5 text-xs bg-pink-600/15 text-pink-200 focus:outline-none">
                {EXPORTERS.map((x) => <option key={x.id} value={x.id} disabled={!x.ready}>{x.label}{x.ready ? '' : ' (soon)'}</option>)}
              </select>
              <button onClick={doExport} disabled={!curEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-pink-600/25 text-pink-200 hover:bg-pink-600/40 disabled:opacity-40"><Download size={12} /> Export</button>
            </div>
          )}
        </div>
        <input ref={texInput} type="file" multiple accept=".dds,.ytd,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => { Array.from(e.target.files || []).forEach(importTexture); e.target.value = ''; }} />
      </div>

      {/* EMPTY */}
      {phase === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="border-2 border-dashed border-pink-500/20 rounded-2xl p-12 flex flex-col items-center text-center bg-pink-500/3 max-w-lg">
            <div className="w-16 h-16 rounded-2xl bg-pink-500/15 border border-pink-500/20 flex items-center justify-center mb-4"><Car size={28} className="text-pink-400" /></div>
            <h3 className="text-lg font-bold text-surface-100 mb-1.5">Open a Vehicle Resource</h3>
            <p className="text-sm text-surface-400 mb-5">Point at any FiveM vehicle folder. The editor finds the <b className="text-surface-200">.yft</b> and <b className="text-surface-200">.ytd</b> files automatically, reads the real textures, and lets you edit the livery. No converting, no extra tools.</p>
            <button onClick={openFolder} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-pink-600/25 text-pink-200 border border-pink-500/30 rounded-xl hover:bg-pink-600/40 transition-all"><FolderOpen size={16} /> Open Vehicle Folder</button>
          </div>
        </div>
      )}

      {/* VEHICLE LIST */}
      {phase === 'list' && (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-[11px] uppercase tracking-widest text-surface-600 mb-3">{folderName} · {vehicles.length} vehicles detected</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {vehicles.map((v) => (
              <button key={v.name + v.dir} onClick={() => selectVehicle(v)} className="text-left p-4 rounded-xl bg-surface-900/40 border border-overlay-6 hover:border-pink-500/40 hover:bg-surface-900/70 transition-all group">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center group-hover:bg-pink-500/20"><Car size={16} className="text-pink-400" /></div>
                  <div className="min-w-0"><p className="text-sm font-semibold text-surface-100 truncate">{v.name}</p><p className="text-[10px] text-surface-500">{v.ytds.length} texture file{v.ytds.length !== 1 ? 's' : ''}</p></div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {v.yft && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">.yft</span>}
                  {v.hiYft && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300">_hi.yft</span>}
                  {v.ytds.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">.ytd</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LOADING */}
      {phase === 'loading' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 size={28} className="text-pink-400 animate-spin" />
          <p className="text-sm text-surface-300">{loadStage || 'Loading…'}</p>
          <p className="text-[11px] text-surface-600">{activeVehicle?.name}</p>
        </div>
      )}

      {/* EDIT */}
      {phase === 'edit' && (
        <div className="flex-1 flex overflow-hidden" onDrop={(e) => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach(importTexture); }} onDragOver={(e) => e.preventDefault()}>
          {/* LEFT — textures + layers */}
          <div className="w-60 shrink-0 flex flex-col border-r border-overlay-6 bg-surface-950/20 overflow-hidden">
            <div className="shrink-0 px-3 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Textures</span>
              <button onClick={() => setShowAllTex((v) => !v)} title="Show every texture in the YTD (debug)" className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${showAllTex ? 'bg-cyan-600/20 text-cyan-300' : 'text-surface-600 hover:text-surface-300 hover:bg-overlay-4'}`}>Show all</button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '42%' }}>
              {targets.length === 0 && !showAllTex && <p className="text-[11px] text-surface-600 px-3 pb-3">No editable textures decoded. Toggle <b className="text-surface-400">Show all</b> or open <b className="text-cyan-400">Diagnostics</b>.</p>}
              {!showAllTex && targets.map((t) => (
                <button key={t.id} onClick={() => selectTarget(t.id)} className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-all ${selected === t.id ? 'bg-primary-600/15 text-primary-300' : 'text-surface-400 hover:bg-overlay-4 hover:text-surface-200'}`}>
                  <div className="w-8 h-8 rounded bg-surface-800 border border-overlay-6 shrink-0 overflow-hidden">{t.base ? <ThumbImageData id={t.base} /> : <div className="w-full h-full bg-surface-700" />}</div>
                  <div className="min-w-0 flex-1"><p className="text-[11px] font-medium truncate">{t.name}</p><div className="flex items-center gap-1 mt-0.5"><span className="text-[9px] px-1 rounded bg-surface-700/40 text-surface-400">{t.format}</span><span className="text-[9px] text-surface-600">{t.w}×{t.h}</span></div></div>
                </button>
              ))}
              {showAllTex && diagnostics && diagnostics.ytds.flatMap((y) => y.textures).map((rec, i) => {
                const target = targets.find((t) => t.name === rec.name && t.w === rec.width && t.h === rec.height);
                return (
                  <button key={i} disabled={!rec.decoded} onClick={() => target && selectTarget(target.id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-all ${target && selected === target.id ? 'bg-primary-600/15 text-primary-300' : rec.decoded ? 'text-surface-400 hover:bg-overlay-4 hover:text-surface-200' : 'text-surface-600 opacity-70 cursor-default'}`}>
                    <div className="w-8 h-8 rounded bg-surface-800 border border-overlay-6 shrink-0 overflow-hidden flex items-center justify-center">
                      {rec.imageData ? <ThumbImageData id={rec.imageData} /> : rec.decoded ? <ImageIcon size={12} className="text-surface-600" /> : <XCircle size={12} className="text-red-500/60" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium truncate">{rec.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[9px] px-1 rounded ${rec.decoded ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{rec.format || 'unknown'}</span>
                        <span className="text-[9px] text-surface-600">{rec.width}×{rec.height}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 flex flex-col overflow-hidden border-t border-overlay-6">
              <div className="shrink-0 px-3 pt-2.5 pb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600 flex items-center gap-1"><LayersIcon size={11} /> Layers</span>
                <div className="flex items-center gap-0.5">
                  <button title="Add text" onClick={addTextLayer} disabled={!curTarget} className="p-1 rounded text-surface-500 hover:text-primary-400 disabled:opacity-30"><Type size={12} /></button>
                  <button title="Add fill" onClick={addFillLayer} disabled={!curTarget} className="p-1 rounded text-surface-500 hover:text-primary-400 disabled:opacity-30"><Square size={12} /></button>
                  <button title="Add image" onClick={() => texInput.current?.click()} disabled={!curTarget} className="p-1 rounded text-surface-500 hover:text-primary-400 disabled:opacity-30"><Plus size={13} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                {!curTarget && <p className="text-[11px] text-surface-600 px-1 py-2">Select a texture</p>}
                {curEdit && [...curEdit.layers].reverse().map((layer) => (
                  <div key={layer.id} onClick={() => setActiveLayerId(layer.id)} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group transition-all ${activeLayerId === layer.id ? 'bg-primary-600/15 border border-primary-500/20' : 'hover:bg-overlay-4 border border-transparent'}`}>
                    <button onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }} className="text-surface-500 hover:text-surface-200 shrink-0">{layer.visible ? <Eye size={12} /> : <EyeOff size={12} className="opacity-40" />}</button>
                    <div className="w-7 h-7 rounded bg-surface-800 border border-overlay-6 shrink-0 overflow-hidden"><ThumbCanvas source={layer.canvas} /></div>
                    <span className="text-[11px] text-surface-300 truncate flex-1">{layer.name}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1); }} className="p-0.5 text-surface-500 hover:text-surface-200"><ChevronUp size={10} /></button>
                      <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1); }} className="p-0.5 text-surface-500 hover:text-surface-200"><ChevronDown size={10} /></button>
                      {layer.kind !== 'base' && <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} className="p-0.5 text-surface-500 hover:text-red-400"><Trash2 size={10} /></button>}
                    </div>
                  </div>
                ))}
              </div>
              {activeLayer && (
                <div className="shrink-0 border-t border-overlay-6 p-3 space-y-2">
                  <div className="flex items-center justify-between"><span className="text-[11px] text-surface-400">Opacity</span><span className="text-[11px] text-surface-300 font-mono">{activeLayer.opacity}%</span></div>
                  <input type="range" min={0} max={100} value={activeLayer.opacity} onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })} className="w-full h-1.5 accent-pink-500" />
                  <select value={activeLayer.blendMode} onChange={(e) => updateLayer(activeLayer.id, { blendMode: e.target.value as GlobalCompositeOperation })} className="w-full px-2 py-1 text-[11px] bg-overlay-4 border border-overlay-6 rounded text-surface-200 focus:outline-none">{BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                  {activeLayer.kind === 'text' && (
                    <div className="space-y-1.5 pt-1">
                      <input value={activeLayer.text || ''} onChange={(e) => updateLayer(activeLayer.id, { text: e.target.value })} placeholder="Text" className="w-full px-2 py-1 text-[11px] bg-overlay-4 border border-overlay-6 rounded text-surface-200 focus:outline-none" />
                      <div className="flex gap-1.5">
                        <input type="number" value={activeLayer.fontSize || 80} onChange={(e) => updateLayer(activeLayer.id, { fontSize: Number(e.target.value) })} className="w-16 px-2 py-1 text-[11px] bg-overlay-4 border border-overlay-6 rounded text-surface-200 focus:outline-none" />
                        <input type="color" value={activeLayer.color || '#ffffff'} onChange={(e) => updateLayer(activeLayer.id, { color: e.target.value })} className="flex-1 h-7 bg-overlay-4 border border-overlay-6 rounded cursor-pointer" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CENTER — texture editor */}
          <div className="flex-1 flex flex-col overflow-hidden bg-surface-950/30">
            <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-overlay-6">
              <button onClick={() => setTool('select')} className={`p-1.5 rounded ${tool === 'select' ? 'bg-primary-600/20 text-primary-300' : 'text-surface-500 hover:text-surface-200 hover:bg-overlay-4'}`} title="Move / pan"><MousePointer size={14} /></button>
              <button onClick={() => setTool('brush')} className={`p-1.5 rounded ${tool === 'brush' ? 'bg-primary-600/20 text-primary-300' : 'text-surface-500 hover:text-surface-200 hover:bg-overlay-4'}`} title="Brush"><Brush size={14} /></button>
              {tool === 'brush' && (<><input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-6 h-6 rounded border border-overlay-6 cursor-pointer bg-transparent" /><input type="range" min={2} max={120} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-20 accent-pink-500" /><span className="text-[10px] text-surface-500 font-mono w-6">{brushSize}</span></>)}
              <div className="w-px h-4 bg-overlay-6 mx-1" />
              <button onClick={() => setZoom((z) => Math.min(5, z * 1.25))} className="p-1.5 text-surface-500 hover:text-surface-200 hover:bg-overlay-4 rounded"><ZoomIn size={14} /></button>
              <button onClick={() => setZoom((z) => Math.max(0.05, z * 0.8))} className="p-1.5 text-surface-500 hover:text-surface-200 hover:bg-overlay-4 rounded"><ZoomOut size={14} /></button>
              <span className="text-xs text-surface-500 font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => { setZoom(0.4); setPan({ x: 0, y: 0 }); }} className="text-xs text-surface-500 hover:text-surface-200 px-2 py-1 hover:bg-overlay-4 rounded">Fit</button>
              <span className="ml-auto text-[11px] text-surface-600">{curTarget ? `${curTarget.name} · ${curEdit?.w}×${curEdit?.h}` : 'No texture selected'}</span>
            </div>
            <div className="flex-1 overflow-hidden relative" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel} style={{ cursor: tool === 'brush' ? 'crosshair' : 'grab' }}>
              {!curEdit && <div className="absolute inset-0 flex items-center justify-center text-sm text-surface-600">Select a texture to edit</div>}
              {curEdit && (
                <div className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`, transformOrigin: 'center center', pointerEvents: 'all' }}>
                    <div className="relative" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.7)' }}>
                      <canvas ref={centerCanvas} style={{ display: 'block', imageRendering: zoom < 0.5 ? 'auto' : 'pixelated' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — 3D / preview */}
          <div className="w-80 shrink-0 flex flex-col border-l border-overlay-6 bg-surface-950/20">
            <div className="shrink-0 px-4 py-2.5 border-b border-overlay-6 flex items-center gap-2"><Car size={14} className="text-pink-400" /><span className="text-xs font-semibold text-surface-200">Vehicle Preview</span></div>
            {geometry ? (
              <>
                <div ref={viewerMount} className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing" />
                <div className="shrink-0 border-t border-overlay-6 px-3 py-2"><p className="text-[10px] text-surface-500 leading-relaxed"><b className="text-surface-300">Click</b> a part to select its material · edits apply live.</p></div>
              </>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="flex-1 flex items-center justify-center p-5">
                  {curEdit ? (
                    <div className="w-full">
                      <p className="text-[10px] uppercase tracking-widest text-surface-600 mb-2 text-center">Live texture</p>
                      <LivePreview edit={curEdit} />
                    </div>
                  ) : <Box size={40} className="text-surface-700" />}
                </div>
                <div className="shrink-0 border-t border-overlay-6 px-4 py-3 bg-amber-500/5">
                  <div className="flex items-start gap-2">
                    <Wand2 size={14} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-surface-200">Native 3D model engine</p>
                      <p className="text-[10px] text-surface-500 leading-relaxed mt-0.5">{geomReason || 'Building the real vehicle mesh from the .yft.'} Texture editing & export work now; the live 3D car turns on automatically once the engine finishes this model.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DIAGNOSTICS MODAL */}
      {showDiag && diagnostics && <DiagnosticsPanel diag={diagnostics} onClose={() => setShowDiag(false)} />}
    </motion.div>
  );
}

// ── Diagnostics panel ─────────────────────────────────────────────────────────
function DiagnosticsPanel({ diag, onClose }: { diag: VehicleDiagnostics; onClose: () => void }) {
  const s = diag.summary;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl max-h-full flex flex-col bg-surface-900 border border-overlay-6 rounded-2xl shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-overlay-6 bg-surface-950/50">
          <Stethoscope size={16} className="text-cyan-400" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-surface-100">Vehicle Diagnostics — {diag.vehicle}</h2>
            <p className="text-[10px] text-surface-500 truncate">{diag.dir}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-overlay-4"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-2">
            <Stat label="YTD files" value={s.ytdCount} />
            <Stat label="Textures found" value={s.totalTexturesFound} />
            <Stat label="Editable" value={s.totalEditable} good={s.totalEditable > 0} />
            <Stat label="Rejected" value={s.totalRejected} bad={s.totalRejected > 0} />
          </div>

          {/* Verdict helper */}
          <div className="text-[11px] rounded-lg border border-overlay-6 bg-surface-950/40 p-3 text-surface-400 leading-relaxed">
            <b className="text-surface-200">Where's the problem?</b>{' '}
            {s.totalEditable > 0
              ? 'Editable textures decoded — the parser is working for this vehicle.'
              : s.ytdCount === 0
                ? 'No YTD files were attached to this vehicle → this is a resource-scanning issue.'
                : diag.ytds.every((y) => !y.isRSC7)
                  ? 'YTDs found but none are RSC7 → the YTD parser can\'t recognise this container format.'
                  : diag.ytds.every((y) => y.isRSC7 && !y.inflated)
                    ? 'RSC7 detected but decompression failed → decompression/parser layer.'
                    : diag.ytds.some((y) => y.declaredCount > 0 && y.textures.every((t) => !t.decoded))
                      ? 'Dictionary entries were read but every texture was rejected → the YTD parser offsets/format mapping need adjusting (see per-texture reasons below).'
                      : 'Dictionary parsing produced no entries → YTD parser layer.'}
          </div>

          {/* YFT files */}
          <Section title={`YFT model files (${diag.yfts.length})`}>
            {diag.yfts.length === 0 && <Empty>No .yft files detected for this vehicle.</Empty>}
            {diag.yfts.map((y, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 text-[11px] border-b border-overlay-4 last:border-0">
                <FileText size={12} className="text-blue-400 shrink-0" />
                <span className="text-surface-200 font-medium truncate flex-1">{y.fileName}</span>
                {y.isHi && <span className="text-[9px] px-1 rounded bg-indigo-500/15 text-indigo-300">hi</span>}
                <span className="text-[9px] px-1 rounded bg-surface-700/40 text-surface-400">{fmtBytes(y.fileSize)}</span>
                <span className={`text-[9px] px-1 rounded ${y.isRSC7 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{y.isRSC7 ? 'RSC7' : 'non-RSC7'}</span>
              </div>
            ))}
          </Section>
          <p className="text-[10px] text-surface-600 -mt-3">{diag.materials.note}</p>

          {/* YTD files */}
          <Section title={`YTD texture dictionaries (${diag.ytds.length})`}>
            {diag.ytds.length === 0 && <Empty>No .ytd files were attached to this vehicle (resource-scanning issue).</Empty>}
            {diag.ytds.map((y, i) => (
              <div key={i} className="border-b border-overlay-4 last:border-0 py-2">
                <div className="flex items-center gap-2 px-3 text-[11px]">
                  <ImageIcon size={12} className="text-pink-400 shrink-0" />
                  <span className="text-surface-200 font-medium truncate flex-1">{y.fileName}</span>
                  <span className="text-[9px] px-1 rounded bg-surface-700/40 text-surface-400">{fmtBytes(y.fileSize)}</span>
                  <span className={`text-[9px] px-1 rounded ${y.isRSC7 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{y.isRSC7 ? 'RSC7' : 'non-RSC7'}</span>
                  <span className="text-[9px] px-1 rounded bg-cyan-500/15 text-cyan-300">{y.method}</span>
                </div>
                <div className="px-3 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-surface-500 font-mono">
                  {y.inflated && <span>sys {fmtBytes(y.systemSize || 0)} · gfx {fmtBytes(y.graphicsSize || 0)} · inflated {fmtBytes(y.decompressedSize || 0)}</span>}
                  <span>declared count: {y.declaredCount}</span>
                  <span>entries @ {y.entriesOffset != null && y.entriesOffset >= 0 ? `0x${y.entriesOffset.toString(16)}` : 'unresolved'}</span>
                </div>
                {y.notes.map((n, j) => (
                  <p key={j} className="px-3 mt-1 text-[10px] text-amber-300/80">⚠ {n}</p>
                ))}
                {/* per-texture table */}
                {y.textures.length > 0 && (
                  <div className="mt-2 mx-3 rounded-lg border border-overlay-6 overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-2 py-1 bg-surface-950/50 text-[9px] uppercase tracking-wide text-surface-600">
                      <span>Texture</span><span>Size</span><span>Format</span><span>Fmt@</span><span>Status</span>
                    </div>
                    {y.textures.map((t, k) => (
                      <div key={k} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-2 py-1 text-[10px] border-t border-overlay-4 items-center">
                        <span className="text-surface-300 truncate" title={t.reason}>{t.name}</span>
                        <span className="text-surface-500 font-mono">{t.width}×{t.height}</span>
                        <span className="text-surface-500 font-mono">{t.format || `0x${t.formatCode.toString(16)}`}</span>
                        <span className="text-surface-600 font-mono">{t.formatFieldOffset != null ? `+0x${t.formatFieldOffset.toString(16)}` : '—'}</span>
                        <span className="flex items-center gap-1">
                          {t.decoded
                            ? <><CheckCircle2 size={11} className="text-emerald-400" /><span className="text-emerald-300">ok</span></>
                            : <><XCircle size={11} className="text-red-400" /><span className="text-red-300 truncate" title={t.reason}>rej</span></>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* rejection reasons */}
                {y.textures.some((t) => !t.decoded) && (
                  <div className="mt-1.5 mx-3 space-y-0.5">
                    {y.textures.filter((t) => !t.decoded).slice(0, 12).map((t, k) => (
                      <p key={k} className="text-[9px] text-surface-500"><span className="text-red-300/80">{t.name}:</span> {t.reason}</p>
                    ))}
                  </div>
                )}
                {/* RAW INSPECTION */}
                {(y.dictHeaderHex || y.textures.some((t) => t.rawHex)) && (
                  <details className="mt-2 mx-3">
                    <summary className="text-[10px] text-cyan-300 cursor-pointer hover:text-cyan-200">Raw byte inspection (dictionary header + first textures)</summary>
                    <div className="mt-1.5 space-y-2">
                      {y.dictHeaderHex && (
                        <div>
                          <p className="text-[9px] text-surface-500 mb-0.5">Dictionary header @ system 0x0 (Textures ptr @0x30, count @0x38):</p>
                          <pre className="text-[9px] leading-tight text-surface-400 bg-black/40 rounded p-2 overflow-x-auto font-mono">{y.dictHeaderHex}</pre>
                        </div>
                      )}
                      {y.textures.filter((t) => t.rawHex).map((t, k) => (
                        <div key={k}>
                          <p className="text-[9px] text-surface-500 mb-0.5">
                            <span className="text-surface-300">{t.name}</span> @ 0x{(t.texOffset ?? 0).toString(16)} —
                            Format <span className="text-cyan-300">{t.format || `0x${t.formatCode.toString(16)}`}</span> @ +0x{(t.formatFieldOffset ?? 0).toString(16)},
                            dims {t.width}×{t.height}, derived Width@+0x{((t.formatFieldOffset ?? 8) - 8).toString(16)}
                          </p>
                          <pre className="text-[9px] leading-tight text-surface-400 bg-black/40 rounded p-2 overflow-x-auto font-mono">{t.rawHex}</pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${good ? 'border-emerald-500/30 bg-emerald-500/5' : bad ? 'border-red-500/30 bg-red-500/5' : 'border-overlay-6 bg-surface-950/40'}`}>
      <p className={`text-lg font-bold ${good ? 'text-emerald-300' : bad ? 'text-red-300' : 'text-surface-200'}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-surface-600">{label}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-600 mb-1.5">{title}</p>
      <div className="rounded-lg border border-overlay-6 bg-surface-950/30 overflow-hidden">{children}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2 text-[11px] text-surface-500">{children}</p>;
}
function fmtBytes(n: number): string {
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => reject(new Error('Image load failed')); img.src = url;
  });
}
function ThumbCanvas({ source }: { source: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current; if (!c) return; c.width = 56; c.height = 56; const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, 56, 56); try { ctx.drawImage(source, 0, 0, 56, 56); } catch { /* */ } });
  return <canvas ref={ref} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />;
}
function ThumbImageData({ id }: { id: ImageData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current; if (!c) return; const tmp = document.createElement('canvas'); tmp.width = id.width; tmp.height = id.height; tmp.getContext('2d')!.putImageData(id, 0, 0); c.width = 56; c.height = 56; c.getContext('2d')!.drawImage(tmp, 0, 0, 56, 56); }, [id]);
  return <canvas ref={ref} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />;
}
function LivePreview({ edit }: { edit: TargetEdit }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const size = 240; c.width = size; c.height = size;
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, size, size);
    const scale = Math.min(size / edit.w, size / edit.h); const dw = edit.w * scale, dh = edit.h * scale;
    ctx.drawImage(edit.canvas, (size - dw) / 2, (size - dh) / 2, dw, dh);
  });
  return <canvas ref={ref} className="w-full rounded-lg border border-overlay-6" style={{ imageRendering: 'pixelated' }} />;
}
