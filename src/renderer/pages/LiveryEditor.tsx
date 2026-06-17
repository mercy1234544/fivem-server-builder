import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Upload, Eye, EyeOff, Trash2, ChevronUp, ChevronDown, Download, Palette,
  ZoomIn, ZoomOut, RotateCcw, Plus, Car, Box, Grid3x3, Type, Brush,
  MousePointer, Image as ImageIcon, Layers as LayersIcon, ChevronRight, Square,
} from 'lucide-react';
import { ddsToImageData, extractTexturesFromYTD } from '../services/ytdParser';
import {
  loadVehicleGLB, slotUVEdges, slotTextureToImageData,
  type LoadedVehicle, type VehicleMaterialSlot,
} from '../services/glbVehicle';
import { VehicleViewer } from '../services/vehicleViewer';
import { EXPORTERS, downloadResult } from '../services/liveryExport';

// ── Layer model ─────────────────────────────────────────────────────────────
type LayerKind = 'base' | 'image' | 'paint' | 'text' | 'fill';
interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  canvas: HTMLCanvasElement;
  x: number; y: number; w: number; h: number;
  // text-only
  text?: string; fontSize?: number; color?: string;
}

interface SlotEdit {
  layers: Layer[];
  canvas: HTMLCanvasElement;   // composited output (the live texture)
  w: number; h: number;
  uvEdges: Float32Array;
}

const BLEND_MODES: GlobalCompositeOperation[] = [
  'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'hard-light', 'soft-light', 'difference', 'exclusion',
];

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function uid() { return Math.random().toString(36).slice(2); }

function canvasFromImageData(id: ImageData): HTMLCanvasElement {
  const c = newCanvas(id.width, id.height);
  c.getContext('2d')!.putImageData(id, 0, 0);
  return c;
}

function renderTextLayer(layer: Layer) {
  const ctx = layer.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  ctx.fillStyle = layer.color || '#ffffff';
  ctx.font = `bold ${layer.fontSize || 80}px Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(layer.text || 'TEXT', 20, 20);
}

// ── Component ────────────────────────────────────────────────────────────────
export default function LiveryEditor() {
  const [vehicle, setVehicle] = useState<LoadedVehicle | null>(null);
  const [vehicleName, setVehicleName] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'brush'>('select');
  const [brushColor, setBrushColor] = useState('#ff3344');
  const [brushSize, setBrushSize] = useState(24);
  const [showUV, setShowUV] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [zoom, setZoom] = useState(0.4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [exporterId, setExporterId] = useState('png');
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const edits = useRef<Map<string, SlotEdit>>(new Map());
  const viewerRef = useRef<VehicleViewer | null>(null);
  const viewerMount = useRef<HTMLDivElement>(null);
  const centerCanvas = useRef<HTMLCanvasElement>(null);   // visible composite
  const uvOverlay = useRef<HTMLCanvasElement>(null);      // UV wireframe
  const glbInput = useRef<HTMLInputElement>(null);
  const texInput = useRef<HTMLInputElement>(null);

  const painting = useRef(false);
  const panning = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });

  // ── Viewer lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewerMount.current) return;
    const v = new VehicleViewer(viewerMount.current);
    v.onPickSlot = (id) => selectSlot(id);
    viewerRef.current = v;
    return () => { v.dispose(); viewerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Slot editing helpers ────────────────────────────────────────────────────
  const slotById = (id: string | null) =>
    vehicle?.slots.find((s) => s.id === id) || null;

  function ensureEdit(slot: VehicleMaterialSlot): SlotEdit {
    let e = edits.current.get(slot.id);
    if (e) return e;
    const base = slotTextureToImageData(slot);
    const w = base?.width || 1024;
    const h = base?.height || 1024;
    const layers: Layer[] = [];
    if (base) {
      layers.push({
        id: uid(), name: 'Base texture', kind: 'base', visible: true,
        opacity: 100, blendMode: 'source-over',
        canvas: canvasFromImageData(base), x: 0, y: 0, w, h,
      });
    }
    e = { layers, canvas: newCanvas(w, h), w, h, uvEdges: slotUVEdges(slot) };
    edits.current.set(slot.id, e);
    composite(slot.id);
    return e;
  }

  function composite(slotId: string) {
    const e = edits.current.get(slotId);
    if (!e) return;
    const ctx = e.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, e.w, e.h);
    for (const layer of e.layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
      ctx.restore();
    }
    // Push live to 3D + redraw center view if this is the selected slot.
    const slot = slotById(slotId);
    if (slot) viewerRef.current?.setSlotTexture(slot, e.canvas);
    if (slotId === selectedSlot) drawCenter(e);
  }

  function drawCenter(e: SlotEdit) {
    const cv = centerCanvas.current;
    if (!cv) return;
    cv.width = e.w; cv.height = e.h;
    const ctx = cv.getContext('2d')!;
    // checkerboard
    const pat = newCanvas(16, 16); const pc = pat.getContext('2d')!;
    pc.fillStyle = '#1a1c26'; pc.fillRect(0, 0, 16, 16);
    pc.fillStyle = '#232533'; pc.fillRect(0, 0, 8, 8); pc.fillRect(8, 8, 8, 8);
    ctx.fillStyle = ctx.createPattern(pat, 'repeat')!;
    ctx.fillRect(0, 0, e.w, e.h);
    ctx.drawImage(e.canvas, 0, 0);
    drawUV(e);
  }

  function drawUV(e: SlotEdit) {
    const ov = uvOverlay.current;
    if (!ov) return;
    ov.width = e.w; ov.height = e.h;
    const ctx = ov.getContext('2d')!;
    ctx.clearRect(0, 0, e.w, e.h);
    if (!showUV || e.uvEdges.length === 0) return;
    ctx.strokeStyle = 'rgba(80,200,255,0.55)';
    ctx.lineWidth = Math.max(1, e.w / 1024);
    ctx.beginPath();
    const u = e.uvEdges;
    for (let i = 0; i < u.length; i += 4) {
      ctx.moveTo(u[i] * e.w, u[i + 1] * e.h);
      ctx.lineTo(u[i + 2] * e.w, u[i + 3] * e.h);
    }
    ctx.stroke();
  }

  function selectSlot(id: string) {
    const slot = slotById(id);
    if (!slot) return;
    setSelectedSlot(id);
    const e = ensureEdit(slot);
    setActiveLayerId(e.layers[e.layers.length - 1]?.id ?? null);
    requestAnimationFrame(() => { drawCenter(e); });
    rerender();
  }

  useEffect(() => {
    if (selectedSlot) {
      const e = edits.current.get(selectedSlot);
      if (e) drawCenter(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUV, selectedSlot]);

  // ── Imports ─────────────────────────────────────────────────────────────────
  const importGLB = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const v = await loadVehicleGLB(buf);
      if (!v.slots.length) { toast.error('No materials found in model'); return; }
      edits.current.clear();
      setVehicle(v);
      setVehicleName(file.name.replace(/\.(glb|gltf)$/i, ''));
      viewerRef.current?.setVehicle(v);
      viewerRef.current?.setWireframe(wireframe);
      // auto-select first paint/livery slot
      const first = v.slots[0];
      setTimeout(() => selectSlot(first.id), 0);
      toast.success(`Loaded ${v.slots.length} material slots`);
    } catch (e: any) {
      toast.error(`Could not load model: ${e?.message || e}`);
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wireframe]);

  const importTexture = useCallback(async (file: File) => {
    const slot = slotById(selectedSlot);
    if (!slot) { toast.error('Select a material slot first'); return; }
    const e = ensureEdit(slot);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.dds') || name.endsWith('.ytd')) {
        const buf = await file.arrayBuffer();
        let id: ImageData | null = null;
        if (name.endsWith('.dds')) {
          id = ddsToImageData(new Uint8Array(buf));
        } else {
          const tex = await extractTexturesFromYTD(buf);
          if (tex.length) id = ddsToImageData(tex[0].ddsBytes);
        }
        if (!id) { toast.error('Could not decode texture'); return; }
        addLayer(e, { kind: 'image', name: file.name, canvas: canvasFromImageData(id), w: id.width, h: id.height });
        toast.success(`Added ${file.name}`);
      } else if (name.match(/\.(png|jpe?g|webp|bmp)$/)) {
        const img = await loadImage(file);
        const c = newCanvas(img.naturalWidth, img.naturalHeight);
        c.getContext('2d')!.drawImage(img, 0, 0);
        addLayer(e, { kind: 'image', name: file.name, canvas: c, w: img.naturalWidth, h: img.naturalHeight });
        toast.success(`Added ${file.name}`);
      } else {
        toast.error('Supported: .dds .ytd .png .jpg');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot, vehicle]);

  function routeFile(file: File) {
    const n = file.name.toLowerCase();
    if (n.endsWith('.glb') || n.endsWith('.gltf')) importGLB(file);
    else importTexture(file);
  }

  // ── Layer ops ───────────────────────────────────────────────────────────────
  function addLayer(e: SlotEdit, partial: Partial<Layer> & { kind: LayerKind; canvas: HTMLCanvasElement; w: number; h: number }) {
    const layer: Layer = {
      id: uid(), name: partial.name || partial.kind, visible: true, opacity: 100,
      blendMode: 'source-over', x: 0, y: 0,
      ...partial,
    } as Layer;
    e.layers.push(layer);
    setActiveLayerId(layer.id);
    composite(slotIdOf(e));
    rerender();
  }

  function slotIdOf(e: SlotEdit): string {
    for (const [id, v] of edits.current) if (v === e) return id;
    return selectedSlot || '';
  }

  function addTextLayer() {
    const slot = slotById(selectedSlot); if (!slot) return;
    const e = ensureEdit(slot);
    const c = newCanvas(e.w, e.h);
    const layer: Layer = {
      id: uid(), name: 'Text', kind: 'text', visible: true, opacity: 100,
      blendMode: 'source-over', canvas: c, x: 0, y: 0, w: e.w, h: e.h,
      text: 'TEXT', fontSize: Math.round(e.h / 12), color: '#ffffff',
    };
    renderTextLayer(layer);
    e.layers.push(layer);
    setActiveLayerId(layer.id);
    composite(slot.id); rerender();
  }

  function addFillLayer() {
    const slot = slotById(selectedSlot); if (!slot) return;
    const e = ensureEdit(slot);
    const c = newCanvas(e.w, e.h);
    const ctx = c.getContext('2d')!; ctx.fillStyle = brushColor; ctx.fillRect(0, 0, e.w, e.h);
    addLayer(e, { kind: 'fill', name: 'Fill', canvas: c, w: e.w, h: e.h, opacity: 60 });
  }

  function addPaintLayer(): Layer | null {
    const slot = slotById(selectedSlot); if (!slot) return null;
    const e = ensureEdit(slot);
    const c = newCanvas(e.w, e.h);
    const layer: Layer = {
      id: uid(), name: 'Paint', kind: 'paint', visible: true, opacity: 100,
      blendMode: 'source-over', canvas: c, x: 0, y: 0, w: e.w, h: e.h,
    };
    e.layers.push(layer); setActiveLayerId(layer.id); rerender();
    return layer;
  }

  function updateLayer(id: string, changes: Partial<Layer>) {
    const e = edits.current.get(selectedSlot || ''); if (!e) return;
    const layer = e.layers.find((l) => l.id === id); if (!layer) return;
    Object.assign(layer, changes);
    if (layer.kind === 'text') renderTextLayer(layer);
    composite(selectedSlot!); rerender();
  }

  function deleteLayer(id: string) {
    const e = edits.current.get(selectedSlot || ''); if (!e) return;
    e.layers = e.layers.filter((l) => l.id !== id);
    if (activeLayerId === id) setActiveLayerId(e.layers[e.layers.length - 1]?.id ?? null);
    composite(selectedSlot!); rerender();
  }

  function moveLayer(id: string, dir: -1 | 1) {
    const e = edits.current.get(selectedSlot || ''); if (!e) return;
    const i = e.layers.findIndex((l) => l.id === id); const j = i + dir;
    if (j < 0 || j >= e.layers.length) return;
    [e.layers[i], e.layers[j]] = [e.layers[j], e.layers[i]];
    composite(selectedSlot!); rerender();
  }

  // ── Center canvas interaction (pan / brush) ─────────────────────────────────
  function canvasPoint(ev: React.PointerEvent): { x: number; y: number } | null {
    const cv = centerCanvas.current; if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * cv.width,
      y: ((ev.clientY - rect.top) / rect.height) * cv.height,
    };
  }

  function paintAt(ev: React.PointerEvent) {
    const e = edits.current.get(selectedSlot || ''); if (!e) return;
    let layer = e.layers.find((l) => l.id === activeLayerId && l.kind === 'paint');
    if (!layer) layer = addPaintLayer() || undefined;
    if (!layer) return;
    const p = canvasPoint(ev); if (!p) return;
    const ctx = layer.canvas.getContext('2d')!;
    ctx.fillStyle = brushColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, brushSize, 0, Math.PI * 2);
    ctx.fill();
    composite(selectedSlot!);
  }

  const onPointerDown = (ev: React.PointerEvent) => {
    if (ev.button === 1 || ev.altKey || tool === 'select') {
      panning.current = true; lastPt.current = { x: ev.clientX, y: ev.clientY };
    } else if (tool === 'brush') {
      painting.current = true; paintAt(ev);
    }
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (panning.current) {
      setPan((p) => ({ x: p.x + ev.clientX - lastPt.current.x, y: p.y + ev.clientY - lastPt.current.y }));
      lastPt.current = { x: ev.clientX, y: ev.clientY };
    } else if (painting.current) paintAt(ev);
  };
  const onPointerUp = () => { panning.current = false; painting.current = false; };
  const onWheel = (ev: React.WheelEvent) => setZoom((z) => Math.max(0.05, Math.min(5, z * (ev.deltaY > 0 ? 0.9 : 1.1))));

  // ── Export ──────────────────────────────────────────────────────────────────
  async function doExport() {
    const e = edits.current.get(selectedSlot || '');
    const exporter = EXPORTERS.find((x) => x.id === exporterId);
    if (!e || !exporter) { toast.error('Nothing to export'); return; }
    if (!exporter.ready) { toast.error(exporter.label + ' not available yet'); return; }
    try {
      const slot = slotById(selectedSlot);
      const base = `${vehicleName || 'livery'}_${slot?.name || 'texture'}`.replace(/[^\w.-]+/g, '_');
      const res = await exporter.export(e.canvas, base);
      downloadResult(res);
      toast.success(`Exported ${res.filename}`);
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    }
  }

  function toggleWire() {
    const next = !wireframe; setWireframe(next); viewerRef.current?.setWireframe(next);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const curEdit = selectedSlot ? edits.current.get(selectedSlot) : null;
  const curSlot = slotById(selectedSlot);
  const activeLayer = curEdit?.layers.find((l) => l.id === activeLayerId) || null;

  // group slots by section
  const grouped: Record<string, VehicleMaterialSlot[]> = {};
  vehicle?.slots.forEach((s) => { (grouped[s.section] ||= []).push(s); });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-overlay-6 bg-surface-950/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-500/25 flex items-center justify-center">
            <Palette size={16} className="text-pink-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-surface-100">Livery Editor</h1>
            <p className="text-[10px] text-surface-500">{vehicle ? `${vehicleName} · ${vehicle.slots.length} materials` : 'OpenIV-style · real vehicle geometry'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => glbInput.current?.click()} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary">
            <Box size={12} /> Import Vehicle (GLB)
          </button>
          <button onClick={() => texInput.current?.click()} disabled={!vehicle}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary disabled:opacity-40">
            <ImageIcon size={12} /> Add Texture
          </button>
          <div className="flex items-center rounded-lg overflow-hidden border border-pink-500/30">
            <select value={exporterId} onChange={(e) => setExporterId(e.target.value)}
              className="px-2 py-1.5 text-xs bg-pink-600/15 text-pink-200 focus:outline-none">
              {EXPORTERS.map((x) => <option key={x.id} value={x.id} disabled={!x.ready}>{x.label}{x.ready ? '' : ' (soon)'}</option>)}
            </select>
            <button onClick={doExport} disabled={!curEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-pink-600/25 text-pink-200 hover:bg-pink-600/40 transition-all disabled:opacity-40">
              <Download size={12} /> Export
            </button>
          </div>
        </div>
        <input ref={glbInput} type="file" accept=".glb,.gltf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importGLB(f); e.target.value = ''; }} />
        <input ref={texInput} type="file" multiple accept=".dds,.ytd,.png,.jpg,.jpeg,.webp" className="hidden"
          onChange={(e) => { Array.from(e.target.files || []).forEach(importTexture); e.target.value = ''; }} />
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden" onDrop={(e) => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach(routeFile); }} onDragOver={(e) => e.preventDefault()}>

        {/* LEFT — materials + layers */}
        <div className="w-60 shrink-0 flex flex-col border-r border-overlay-6 bg-surface-950/20 overflow-hidden">
          <div className="shrink-0 px-3 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Material Slots</span>
            <span className="text-[10px] text-surface-600">{vehicle?.slots.length || 0}</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '45%' }}>
            {!vehicle && <p className="text-[11px] text-surface-600 px-3 pb-3">Import a GLB to list materials</p>}
            {Object.entries(grouped).map(([section, slots]) => (
              <div key={section} className="mb-1">
                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-surface-600 flex items-center gap-1">
                  <ChevronRight size={9} /> {section}
                </div>
                {slots.map((s) => (
                  <button key={s.id}
                    onClick={() => selectSlot(s.id)}
                    onMouseEnter={() => viewerRef.current?.highlightSlot(s.id)}
                    onMouseLeave={() => viewerRef.current?.highlightSlot(null)}
                    className={`w-full text-left pl-5 pr-3 py-1.5 flex items-center gap-2 transition-all ${selectedSlot === s.id ? 'bg-primary-600/15 text-primary-300' : 'text-surface-400 hover:bg-overlay-4 hover:text-surface-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.originalMap ? 'bg-emerald-400' : 'bg-surface-600'}`} />
                    <span className="text-[11px] font-medium truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Layers */}
          <div className="flex-1 flex flex-col overflow-hidden border-t border-overlay-6">
            <div className="shrink-0 px-3 pt-2.5 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600 flex items-center gap-1"><LayersIcon size={11} /> Layers</span>
              <div className="flex items-center gap-0.5">
                <button title="Add text" onClick={addTextLayer} disabled={!curSlot} className="p-1 rounded text-surface-500 hover:text-primary-400 disabled:opacity-30"><Type size={12} /></button>
                <button title="Add fill" onClick={addFillLayer} disabled={!curSlot} className="p-1 rounded text-surface-500 hover:text-primary-400 disabled:opacity-30"><Square size={12} /></button>
                <button title="Add image" onClick={() => texInput.current?.click()} disabled={!curSlot} className="p-1 rounded text-surface-500 hover:text-primary-400 disabled:opacity-30"><Plus size={13} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {!curSlot && <p className="text-[11px] text-surface-600 px-1 py-2">Select a material slot</p>}
              {curEdit && [...curEdit.layers].reverse().map((layer) => (
                <div key={layer.id} onClick={() => setActiveLayerId(layer.id)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group transition-all ${activeLayerId === layer.id ? 'bg-primary-600/15 border border-primary-500/20' : 'hover:bg-overlay-4 border border-transparent'}`}>
                  <button onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }} className="text-surface-500 hover:text-surface-200 shrink-0">
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} className="opacity-40" />}
                  </button>
                  <div className="w-7 h-7 rounded bg-surface-800 border border-overlay-6 shrink-0 overflow-hidden">
                    <ThumbCanvas source={layer.canvas} />
                  </div>
                  <span className="text-[11px] text-surface-300 truncate flex-1">{layer.name}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1); }} className="p-0.5 text-surface-500 hover:text-surface-200"><ChevronUp size={10} /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1); }} className="p-0.5 text-surface-500 hover:text-surface-200"><ChevronDown size={10} /></button>
                    {layer.kind !== 'base' && <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} className="p-0.5 text-surface-500 hover:text-red-400"><Trash2 size={10} /></button>}
                  </div>
                </div>
              ))}
            </div>

            {/* Layer properties */}
            {activeLayer && (
              <div className="shrink-0 border-t border-overlay-6 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-surface-400">Opacity</span>
                  <span className="text-[11px] text-surface-300 font-mono">{activeLayer.opacity}%</span>
                </div>
                <input type="range" min={0} max={100} value={activeLayer.opacity}
                  onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                  className="w-full h-1.5 accent-pink-500" />
                <select value={activeLayer.blendMode} onChange={(e) => updateLayer(activeLayer.id, { blendMode: e.target.value as GlobalCompositeOperation })}
                  className="w-full px-2 py-1 text-[11px] bg-overlay-4 border border-overlay-6 rounded text-surface-200 focus:outline-none">
                  {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {activeLayer.kind === 'text' && (
                  <div className="space-y-1.5 pt-1">
                    <input value={activeLayer.text || ''} onChange={(e) => updateLayer(activeLayer.id, { text: e.target.value })}
                      placeholder="Text" className="w-full px-2 py-1 text-[11px] bg-overlay-4 border border-overlay-6 rounded text-surface-200 focus:outline-none" />
                    <div className="flex gap-1.5">
                      <input type="number" value={activeLayer.fontSize || 80} onChange={(e) => updateLayer(activeLayer.id, { fontSize: Number(e.target.value) })}
                        className="w-16 px-2 py-1 text-[11px] bg-overlay-4 border border-overlay-6 rounded text-surface-200 focus:outline-none" />
                      <input type="color" value={activeLayer.color || '#ffffff'} onChange={(e) => updateLayer(activeLayer.id, { color: e.target.value })}
                        className="flex-1 h-7 bg-overlay-4 border border-overlay-6 rounded cursor-pointer" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CENTER — UV / texture editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-surface-950/30">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-overlay-6">
            <button onClick={() => setTool('select')} className={`p-1.5 rounded transition-all ${tool === 'select' ? 'bg-primary-600/20 text-primary-300' : 'text-surface-500 hover:text-surface-200 hover:bg-overlay-4'}`} title="Move / pan"><MousePointer size={14} /></button>
            <button onClick={() => setTool('brush')} className={`p-1.5 rounded transition-all ${tool === 'brush' ? 'bg-primary-600/20 text-primary-300' : 'text-surface-500 hover:text-surface-200 hover:bg-overlay-4'}`} title="Brush"><Brush size={14} /></button>
            {tool === 'brush' && (
              <>
                <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-6 h-6 rounded border border-overlay-6 cursor-pointer bg-transparent" />
                <input type="range" min={2} max={120} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-20 accent-pink-500" />
                <span className="text-[10px] text-surface-500 font-mono w-6">{brushSize}</span>
              </>
            )}
            <div className="w-px h-4 bg-overlay-6 mx-1" />
            <button onClick={() => setShowUV((v) => !v)} className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${showUV ? 'bg-cyan-600/15 text-cyan-300' : 'text-surface-500 hover:text-surface-200'}`}><Grid3x3 size={13} /> UV</button>
            <div className="w-px h-4 bg-overlay-6 mx-1" />
            <button onClick={() => setZoom((z) => Math.min(5, z * 1.25))} className="p-1.5 text-surface-500 hover:text-surface-200 hover:bg-overlay-4 rounded"><ZoomIn size={14} /></button>
            <button onClick={() => setZoom((z) => Math.max(0.05, z * 0.8))} className="p-1.5 text-surface-500 hover:text-surface-200 hover:bg-overlay-4 rounded"><ZoomOut size={14} /></button>
            <span className="text-xs text-surface-500 font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => { setZoom(0.4); setPan({ x: 0, y: 0 }); }} className="text-xs text-surface-500 hover:text-surface-200 px-2 py-1 hover:bg-overlay-4 rounded">Fit</button>
            <span className="ml-auto text-[11px] text-surface-600">{curSlot ? `${curSlot.name} · ${curEdit?.w}×${curEdit?.h}` : 'No slot selected'}</span>
          </div>

          <div className="flex-1 overflow-hidden relative" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}
            style={{ cursor: tool === 'brush' ? 'crosshair' : panning.current ? 'grabbing' : 'grab' }}>
            {!curEdit && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-8">
                <div className="border-2 border-dashed border-pink-500/20 rounded-2xl p-10 flex flex-col items-center text-center bg-pink-500/3 max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-pink-500/15 border border-pink-500/20 flex items-center justify-center mb-4"><Box size={28} className="text-pink-400" /></div>
                  <h3 className="text-base font-bold text-surface-100 mb-1.5">Import a Vehicle Model</h3>
                  <p className="text-sm text-surface-400 mb-3">Drop a <b className="text-surface-200">.glb</b> exported from CodeWalker or Sollumz/Blender. Real geometry, real UVs, real material slots — then edit each material's livery and watch it apply live.</p>
                  <p className="text-[11px] text-surface-500">Tip: in CodeWalker, open the <code className="text-cyan-400">.yft</code> → Tools → Export to GLTF/GLB.</p>
                </div>
              </div>
            )}
            {curEdit && (
              <div className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`, transformOrigin: 'center center', pointerEvents: 'all' }}>
                  <div className="relative" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.7)' }}>
                    <canvas ref={centerCanvas} style={{ display: 'block', imageRendering: zoom < 0.5 ? 'auto' : 'pixelated' }} />
                    <canvas ref={uvOverlay} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', imageRendering: 'pixelated' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — real 3D vehicle */}
        <div className="w-80 shrink-0 flex flex-col border-l border-overlay-6 bg-surface-950/20">
          <div className="shrink-0 px-4 py-2.5 border-b border-overlay-6 flex items-center justify-between">
            <div className="flex items-center gap-2"><Car size={14} className="text-pink-400" /><span className="text-xs font-semibold text-surface-200">3D Vehicle</span></div>
            <div className="flex items-center gap-1">
              <button onClick={toggleWire} className={`p-1.5 rounded transition-all ${wireframe ? 'bg-cyan-600/15 text-cyan-300' : 'text-surface-500 hover:text-surface-200 hover:bg-overlay-4'}`} title="Wireframe"><Grid3x3 size={13} /></button>
              <button onClick={() => viewerRef.current?.resetView()} className="p-1.5 rounded text-surface-500 hover:text-surface-200 hover:bg-overlay-4" title="Reset view"><RotateCcw size={13} /></button>
            </div>
          </div>
          <div ref={viewerMount} className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing" />
          <div className="shrink-0 border-t border-overlay-6 px-3 py-2">
            <p className="text-[10px] text-surface-500 leading-relaxed">
              <b className="text-surface-300">Click</b> a part on the car to select its material · <b className="text-surface-300">hover</b> a slot on the left to highlight it here · edits apply live.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

function ThumbCanvas({ source }: { source: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = 56; c.height = 56;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 56, 56);
    try { ctx.drawImage(source, 0, 0, 56, 56); } catch { /* empty */ }
  });
  return <canvas ref={ref} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />;
}
