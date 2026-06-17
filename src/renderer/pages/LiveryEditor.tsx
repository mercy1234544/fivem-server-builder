import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as THREE from 'three';
import {
  Upload, Eye, EyeOff, Trash2, ChevronUp, ChevronDown,
  Download, Image as ImageIcon, Palette, ZoomIn, ZoomOut,
  RotateCcw, Plus, Car,
} from 'lucide-react';
import { extractTexturesFromBuffer, ddsToImageData } from '../services/ytdParser';
import type { ExtractedTexture } from '../services/ytdParser';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0–100
  blendMode: GlobalCompositeOperation;
  imageData: ImageData | null;
  img: HTMLImageElement | null;
  x: number; y: number; w: number; h: number;
  locked: boolean;
}

const BLEND_MODES: GlobalCompositeOperation[] = [
  'source-over','multiply','screen','overlay','darken','lighten',
  'color-dodge','color-burn','hard-light','soft-light','difference','exclusion',
];

function makeLayer(name: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id: Math.random().toString(36).slice(2),
    name, visible: true, opacity: 100,
    blendMode: 'source-over', imageData: null, img: null,
    x: 0, y: 0, w: 2048, h: 2048, locked: false,
    ...overrides,
  };
}

// ── Three.js 3D Preview ───────────────────────────────────────────────────────
function ThreePreview({ sourceCanvas }: { sourceCanvas: HTMLCanvasElement | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    texture: THREE.CanvasTexture;
    animId: number;
    controls: { isDragging: boolean; lastX: number; lastY: number };
    group: THREE.Group;
    autoRotate: boolean;
  } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1117);
    scene.fog = new THREE.Fog(0x0f1117, 12, 28);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(6, 3, 6);
    camera.lookAt(0, 0, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xfff8e7, 1.4);
    sun.position.set(5, 8, 5);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8090ff, 0.4);
    fill.position.set(-5, 2, -3);
    scene.add(fill);

    // Ground grid
    const grid = new THREE.GridHelper(20, 20, 0x222233, 0x1a1a2e);
    grid.position.y = -0.9;
    scene.add(grid);

    // Texture from canvas
    const placeholder = document.createElement('canvas');
    placeholder.width = placeholder.height = 4;
    const pctx = placeholder.getContext('2d')!;
    pctx.fillStyle = '#333';
    pctx.fillRect(0, 0, 4, 4);
    const texture = new THREE.CanvasTexture(sourceCanvas || placeholder);
    texture.colorSpace = THREE.SRGBColorSpace;

    const bodyMat  = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0.55 });
    const darkMat  = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x334466, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });
    const rimMat   = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9 });

    const group = new THREE.Group();

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.85, 1.95), bodyMat);
    body.position.y = 0;
    body.castShadow = true;
    group.add(body);

    // Front hood
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.88), bodyMat);
    hood.position.set(-1.4, 0.48, 0);
    group.add(hood);

    // Rear trunk
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 1.88), bodyMat);
    trunk.position.set(1.55, 0.52, 0);
    group.add(trunk);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.82, 1.72), bodyMat);
    cabin.position.set(0.1, 0.84, 0);
    group.add(cabin);

    // Windshields
    const wshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 1.64), glassMat);
    wshield.position.set(-0.97, 0.84, 0);
    group.add(wshield);
    const rshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 1.64), glassMat);
    rshield.position.set(1.16, 0.84, 0);
    group.add(rshield);

    // Side windows
    [-0.87, 0.87].forEach(z => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.52, 0.06), glassMat);
      win.position.set(0.1, 0.9, z);
      group.add(win);
    });

    // Door panels (slight indents)
    [-0.98, 0.98].forEach(z => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 0.04), bodyMat);
      door.position.set(0.1, 0.0, z);
      group.add(door);
    });

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 28);
    const innerGeo  = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 20);
    [[-1.4,-0.44,1.06],[1.4,-0.44,1.06],[-1.4,-0.44,-1.06],[1.4,-0.44,-1.06]].forEach(([x,y,z])=>{
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI/2; w.position.set(x,y,z); w.castShadow=true;
      group.add(w);
      const rim = new THREE.Mesh(innerGeo, rimMat);
      rim.rotation.x = Math.PI/2; rim.position.set(x,y,z+0.01);
      group.add(rim);
    });

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.12, 0.12, 0.36);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0.6 });
    [0.6,-0.6].forEach(z=>{
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(-2.12, 0.08, z);
      group.add(l);
    });

    // Tail lights
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff1100, emissive: 0xff0000, emissiveIntensity: 0.5 });
    [0.6,-0.6].forEach(z=>{
      const l = new THREE.Mesh(lightGeo, tailMat);
      l.position.set(2.12, 0.08, z);
      group.add(l);
    });

    // Underbody
    const under = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.08, 1.85), darkMat);
    under.position.y = -0.46;
    group.add(under);

    group.position.y = -0.05;
    scene.add(group);

    // Mouse controls
    const controls = { isDragging: false, lastX: 0, lastY: 0 };
    const el = renderer.domElement;
    el.onmouseup   = () => { controls.isDragging=false; };
    el.onmouseleave= () => { controls.isDragging=false; };
    el.onmousemove = (e: MouseEvent) => {
      if (!controls.isDragging) return;
      const dx=e.clientX-controls.lastX; const dy=e.clientY-controls.lastY;
      group.rotation.y += dx*0.012; group.rotation.x += dy*0.006;
      group.rotation.x = Math.max(-0.6, Math.min(0.6, group.rotation.x));
      controls.lastX=e.clientX; controls.lastY=e.clientY;
    };
    el.onwheel = (e: WheelEvent) => { camera.position.z = Math.max(3, Math.min(14, camera.position.z + e.deltaY*0.008)); };

    let animId = 0;
    const ref = { autoRotate: true };
    el.onmousedown = (e: MouseEvent) => { ref.autoRotate=false; controls.isDragging=true; controls.lastX=e.clientX; controls.lastY=e.clientY; };

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (ref.autoRotate) group.rotation.y += 0.004;
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { renderer, scene, camera, texture, animId, controls, group, autoRotate: true };

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Update texture when canvas changes
  useEffect(() => {
    if (!sceneRef.current || !sourceCanvas) return;
    sceneRef.current.texture.image = sourceCanvas;
    sceneRef.current.texture.needsUpdate = true;
  }, [sourceCanvas]);

  const resetView = () => {
    if (!sceneRef.current) return;
    sceneRef.current.group.rotation.set(0,0,0);
    sceneRef.current.camera.position.set(6,3,6);
    sceneRef.current.autoRotate = true;
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full rounded-xl overflow-hidden cursor-grab active:cursor-grabbing" />
      <button onClick={resetView}
        className="absolute top-2 right-2 p-1.5 bg-surface-900/80 border border-overlay-6 rounded-lg text-surface-400 hover:text-surface-200 transition-all backdrop-blur-sm"
        title="Reset view">
        <RotateCcw size={13} />
      </button>
      <div className="absolute bottom-2 left-2 text-[10px] text-surface-600 pointer-events-none">Drag to rotate • Scroll to zoom</div>
    </div>
  );
}

// ── Canvas compositer ─────────────────────────────────────────────────────────
function compositeToCanvas(layers: Layer[], out: HTMLCanvasElement) {
  const W = out.width; const H = out.height;
  const ctx = out.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  // Checkerboard for transparent areas
  const pat = document.createElement('canvas'); pat.width=pat.height=16;
  const pc = pat.getContext('2d')!;
  pc.fillStyle='#1a1a2e'; pc.fillRect(0,0,16,16);
  pc.fillStyle='#222235'; pc.fillRect(0,0,8,8); pc.fillRect(8,8,8,8);
  ctx.fillStyle = ctx.createPattern(pat,'repeat')!;
  ctx.fillRect(0,0,W,H);
  for (const layer of layers) {
    if (!layer.visible) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation = layer.blendMode;
    if (layer.imageData) ctx.putImageData(layer.imageData, layer.x, layer.y);
    else if (layer.img) ctx.drawImage(layer.img, layer.x, layer.y, layer.w, layer.h);
    ctx.restore();
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiveryEditor() {
  const [textures, setTextures]       = useState<ExtractedTexture[]>([]);
  const [selectedTex, setSelectedTex] = useState<number>(-1);
  const [layers, setLayers]           = useState<Layer[]>([]);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [zoom, setZoom]               = useState(0.35);
  const [pan, setPan]                 = useState({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [lastPan, setLastPan]         = useState({ x: 0, y: 0 });
  const [importing, setImporting]     = useState(false);

  const outputCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef= useRef<HTMLInputElement>(null);
  const [previewTick, setPreviewTick] = useState(0);

  // Initialize output canvas
  useEffect(() => {
    outputCanvas.current.width  = 2048;
    outputCanvas.current.height = 2048;
  }, []);

  // Re-composite whenever layers change
  useEffect(() => {
    compositeToCanvas(layers, outputCanvas.current);
    // Mirror to the visible canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')!;
      canvasRef.current.width  = outputCanvas.current.width;
      canvasRef.current.height = outputCanvas.current.height;
      ctx.drawImage(outputCanvas.current, 0, 0);
    }
    setPreviewTick(t => t + 1);
  }, [layers]);

  const addLayerFromImageData = (name: string, id: ImageData) => {
    const layer = makeLayer(name, {
      imageData: id, x: 0, y: 0, w: id.width, h: id.height,
    });
    setLayers(prev => [layer, ...prev]);
    setActiveLayer(layer.id);
  };

  const addLayerFromImg = (name: string, img: HTMLImageElement, x=0, y=0) => {
    const layer = makeLayer(name, { img, x, y, w: img.naturalWidth, h: img.naturalHeight });
    setLayers(prev => [layer, ...prev]);
    setActiveLayer(layer.id);
  };

  // Import YTD / DDS / PNG
  const importFile = useCallback(async (file: File) => {
    setImporting(true);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.ytd') || name.endsWith('.dds')) {
        const buf = await file.arrayBuffer();
        if (name.endsWith('.dds')) {
          const bytes = new Uint8Array(buf);
          const id = ddsToImageData(bytes);
          if (!id) { toast.error('Could not decode DDS file'); return; }
          // Set canvas size to match
          outputCanvas.current.width  = id.width;
          outputCanvas.current.height = id.height;
          setTextures([{ index:0, name:file.name, width:id.width, height:id.height, format:'DXT1', mips:1, ddsBytes:bytes }]);
          setSelectedTex(0);
          addLayerFromImageData(file.name, id);
          toast.success(`Loaded ${id.width}×${id.height} DDS texture`);
        } else {
          const extracted = extractTexturesFromBuffer(buf);
          if (extracted.length === 0) { toast.error('No DDS textures found in YTD'); return; }
          setTextures(extracted);
          setSelectedTex(0);
          const first = extracted[0];
          const id = ddsToImageData(first.ddsBytes);
          if (id) {
            outputCanvas.current.width  = id.width;
            outputCanvas.current.height = id.height;
            addLayerFromImageData(`${first.name} (base)`, id);
          }
          toast.success(`Extracted ${extracted.length} texture${extracted.length>1?'s':''} from YTD`);
        }
      } else if (name.match(/\.(png|jpg|jpeg|webp|bmp)$/)) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          addLayerFromImg(file.name, img);
          URL.revokeObjectURL(url);
          toast.success(`Added ${file.name} as new layer`);
        };
        img.src = url;
      } else {
        toast.error('Supported formats: .ytd, .dds, .png, .jpg');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Import failed');
    } finally { setImporting(false); }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach(importFile);
  };

  const loadTexture = (tex: ExtractedTexture, idx: number) => {
    setSelectedTex(idx);
    const id = ddsToImageData(tex.ddsBytes);
    if (!id) { toast.error('Could not decode texture'); return; }
    outputCanvas.current.width  = id.width;
    outputCanvas.current.height = id.height;
    const existing = layers.find(l => l.name.includes('base'));
    if (existing) {
      setLayers(prev => prev.map(l => l.id===existing.id ? {...l, imageData:id, w:id.width, h:id.height} : l));
    } else {
      addLayerFromImageData(`${tex.name} (base)`, id);
    }
  };

  const updateLayer = (id: string, changes: Partial<Layer>) => {
    setLayers(prev => prev.map(l => l.id===id ? {...l,...changes} : l));
  };

  const deleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id!==id));
    if (activeLayer === id) setActiveLayer(null);
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayers(prev => {
      const arr = [...prev];
      const i = arr.findIndex(l => l.id===id);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const addImageLayer = () => layerInputRef.current?.click();

  const exportPNG = () => {
    const a = document.createElement('a');
    a.href = outputCanvas.current.toDataURL('image/png');
    a.download = `livery_${Date.now()}.png`;
    a.click();
    toast.success('Exported as PNG');
  };

  // Canvas pan/zoom
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey) {
      setIsDraggingPan(true);
      setLastPan({ x: e.clientX, y: e.clientY });
      e.preventDefault();
    }
  };
  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingPan) return;
    setPan(p => ({ x: p.x + e.clientX - lastPan.x, y: p.y + e.clientY - lastPan.y }));
    setLastPan({ x: e.clientX, y: e.clientY });
  };
  const onCanvasMouseUp = () => setIsDraggingPan(false);
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.05, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  const fmtColor = (f: string) => {
    const m: Record<string,string> = { DXT1:'bg-blue-500/20 text-blue-300', DXT5:'bg-purple-500/20 text-purple-300', DXT3:'bg-indigo-500/20 text-indigo-300', RGBA8:'bg-green-500/20 text-green-300', BGRA8:'bg-emerald-500/20 text-emerald-300' };
    return m[f] || 'bg-surface-700/30 text-surface-400';
  };

  const activeLayerData = layers.find(l => l.id === activeLayer);
  const hasContent = layers.length > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-overlay-6 bg-surface-950/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-pink-500/15 border border-pink-500/25 flex items-center justify-center">
            <Palette size={16} className="text-pink-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-surface-100">Livery Editor</h1>
            <p className="text-[10px] text-surface-500">Import YTD · Edit Layers · 3D Preview</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary">
            <Upload size={12} /> Import YTD / DDS / PNG
          </button>
          <button onClick={exportPNG} disabled={!hasContent}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-pink-600/20 text-pink-300 border border-pink-500/30 rounded-lg hover:bg-pink-600/30 transition-all disabled:opacity-40">
            <Download size={12} /> Export PNG
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple accept=".ytd,.dds,.png,.jpg,.jpeg,.webp" className="hidden"
          onChange={e => { Array.from(e.target.files||[]).forEach(importFile); e.target.value=''; }} />
        <input ref={layerInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.bmp" className="hidden"
          onChange={e => { Array.from(e.target.files||[]).forEach(importFile); e.target.value=''; }} />
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left panel — Textures + Layers */}
        <div className="w-56 shrink-0 flex flex-col border-r border-overlay-6 bg-surface-950/20 overflow-hidden">

          {/* Texture list */}
          <div className="shrink-0 border-b border-overlay-6">
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Textures</span>
              <span className="text-[10px] text-surface-600">{textures.length}</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
              {textures.length === 0 ? (
                <p className="text-[11px] text-surface-600 px-3 pb-3">Import a .ytd or .dds file</p>
              ) : textures.map((t, i) => (
                <button key={i} onClick={() => loadTexture(t, i)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-all ${selectedTex===i?'bg-primary-600/15 text-primary-300':'text-surface-400 hover:bg-overlay-4 hover:text-surface-200'}`}>
                  <div className="w-8 h-8 rounded bg-surface-800 border border-overlay-6 shrink-0 overflow-hidden flex items-center justify-center">
                    <ImageIcon size={12} className="text-surface-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate">{t.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`text-[9px] px-1 rounded ${fmtColor(t.format)}`}>{t.format}</span>
                      <span className="text-[9px] text-surface-600">{t.width}×{t.height}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Layer list */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 px-3 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Layers</span>
              <div className="flex items-center gap-1">
                <button onClick={addImageLayer} title="Add image layer"
                  className="p-0.5 rounded text-surface-500 hover:text-primary-400 hover:bg-overlay-4 transition-all">
                  <Plus size={13} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {layers.length === 0 && (
                <p className="text-[11px] text-surface-600 px-1 py-2">Import a file to start</p>
              )}
              {layers.map((layer, idx) => (
                <div key={layer.id} onClick={() => setActiveLayer(layer.id)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all group ${activeLayer===layer.id?'bg-primary-600/15 border border-primary-500/20':'hover:bg-overlay-4 border border-transparent'}`}>
                  <button onClick={e => { e.stopPropagation(); updateLayer(layer.id,{visible:!layer.visible}); }}
                    className="text-surface-500 hover:text-surface-200 shrink-0">
                    {layer.visible ? <Eye size={12}/> : <EyeOff size={12} className="opacity-40"/>}
                  </button>
                  <div className="w-7 h-7 rounded bg-surface-800 border border-overlay-6 shrink-0 overflow-hidden">
                    {layer.imageData ? (
                      <LayerThumb imageData={layer.imageData} />
                    ) : layer.img ? (
                      <img src={layer.img.src} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-surface-700" />
                    )}
                  </div>
                  <span className="text-[11px] text-surface-300 truncate flex-1">{layer.name}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={e=>{e.stopPropagation();moveLayer(layer.id,-1);}} className="p-0.5 text-surface-500 hover:text-surface-200"><ChevronUp size={10}/></button>
                    <button onClick={e=>{e.stopPropagation();moveLayer(layer.id,1);}} className="p-0.5 text-surface-500 hover:text-surface-200"><ChevronDown size={10}/></button>
                    <button onClick={e=>{e.stopPropagation();deleteLayer(layer.id);}} className="p-0.5 text-surface-500 hover:text-red-400"><Trash2 size={10}/></button>
                  </div>
                </div>
              ))}
            </div>

            {/* Layer properties */}
            {activeLayerData && (
              <div className="shrink-0 border-t border-overlay-6 p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">Properties</p>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-surface-400">Opacity</span>
                    <span className="text-[11px] text-surface-300 font-mono">{activeLayerData.opacity}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={activeLayerData.opacity}
                    onChange={e=>updateLayer(activeLayerData.id,{opacity:Number(e.target.value)})}
                    className="w-full h-1.5 rounded-full accent-pink-500" />
                </div>
                <div>
                  <span className="text-[11px] text-surface-400">Blend</span>
                  <select value={activeLayerData.blendMode}
                    onChange={e=>updateLayer(activeLayerData.id,{blendMode:e.target.value as GlobalCompositeOperation})}
                    className="w-full mt-1 px-2 py-1 text-[11px] bg-overlay-4 border border-overlay-6 rounded text-surface-200 focus:outline-none">
                    {BLEND_MODES.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center — Canvas editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-surface-950/30">
          {/* Canvas toolbar */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-overlay-6">
            <button onClick={()=>setZoom(z=>Math.min(4,z*1.25))} className="p-1.5 text-surface-500 hover:text-surface-200 hover:bg-overlay-4 rounded transition-all"><ZoomIn size={14}/></button>
            <button onClick={()=>setZoom(z=>Math.max(0.05,z*0.8))} className="p-1.5 text-surface-500 hover:text-surface-200 hover:bg-overlay-4 rounded transition-all"><ZoomOut size={14}/></button>
            <span className="text-xs text-surface-500 font-mono w-12 text-center">{Math.round(zoom*100)}%</span>
            <div className="w-px h-4 bg-overlay-6"/>
            <button onClick={()=>{setZoom(0.35);setPan({x:0,y:0});}} className="text-xs text-surface-500 hover:text-surface-200 px-2 py-1 hover:bg-overlay-4 rounded">Fit</button>
            <button onClick={()=>{setZoom(1);setPan({x:0,y:0});}} className="text-xs text-surface-500 hover:text-surface-200 px-2 py-1 hover:bg-overlay-4 rounded">1:1</button>
            <div className="ml-auto text-[11px] text-surface-600">
              {outputCanvas.current.width}×{outputCanvas.current.height}px — Alt+drag to pan · Scroll to zoom
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 overflow-hidden relative"
            onMouseDown={onCanvasMouseDown} onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp} onMouseLeave={onCanvasMouseUp}
            onWheel={onWheel} onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
            style={{ cursor: isDraggingPan ? 'grabbing' : 'default' }}>
            {!hasContent && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="border-2 border-dashed border-pink-500/20 rounded-2xl p-12 flex flex-col items-center text-center bg-pink-500/3">
                  <div className="w-16 h-16 rounded-2xl bg-pink-500/15 border border-pink-500/20 flex items-center justify-center mb-4">
                    <Palette size={28} className="text-pink-400"/>
                  </div>
                  <h3 className="text-base font-bold text-surface-100 mb-1.5">Drag & Drop to Start</h3>
                  <p className="text-sm text-surface-400 mb-4">Import a YTD file to extract textures, or drop a PNG/DDS directly</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {['.ytd','.dds','.png','.jpg'].map(t=><span key={t} className="text-[11px] px-2.5 py-0.5 rounded-full bg-overlay-4 border border-overlay-6 text-surface-400">{t}</span>)}
                  </div>
                </div>
              </div>
            )}
            {hasContent && (
              <div className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'none' }}>
                <div style={{
                  position: 'absolute',
                  left: '50%', top: '50%',
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                  transformOrigin: 'center center',
                  pointerEvents: 'all',
                }}>
                  <div className="relative" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 20px 60px rgba(0,0,0,0.7)' }}>
                    <canvas ref={canvasRef}
                      width={outputCanvas.current.width} height={outputCanvas.current.height}
                      style={{ display: 'block', imageRendering: zoom < 0.5 ? 'auto' : 'pixelated' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — 3D Preview */}
        <div className="w-72 shrink-0 flex flex-col border-l border-overlay-6 bg-surface-950/20">
          <div className="shrink-0 px-4 py-3 border-b border-overlay-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car size={14} className="text-pink-400" />
              <span className="text-xs font-semibold text-surface-200">3D Preview</span>
            </div>
            <span className="text-[10px] text-surface-600">Real-time</span>
          </div>
          <div className="flex-1 relative overflow-hidden" key={previewTick > 1 ? 'loaded' : 'init'}>
            <ThreePreview sourceCanvas={hasContent ? outputCanvas.current : null} />
          </div>
          <div className="shrink-0 border-t border-overlay-6 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-600">UV Reference</p>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-surface-500">
              <div className="bg-overlay-4 border border-overlay-6 rounded-lg p-2">
                <p className="text-surface-300 font-medium mb-0.5">Side L/R</p>
                <p>Main livery area</p>
              </div>
              <div className="bg-overlay-4 border border-overlay-6 rounded-lg p-2">
                <p className="text-surface-300 font-medium mb-0.5">Hood/Trunk</p>
                <p>Top panels</p>
              </div>
              <div className="bg-overlay-4 border border-overlay-6 rounded-lg p-2">
                <p className="text-surface-300 font-medium mb-0.5">Front/Rear</p>
                <p>Bumper area</p>
              </div>
              <div className="bg-overlay-4 border border-overlay-6 rounded-lg p-2">
                <p className="text-surface-300 font-medium mb-0.5">Roof</p>
                <p>Upper surface</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

// Thumbnail for layer panel
function LayerThumb({ imageData }: { imageData: ImageData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.width  = imageData.width;
    ref.current.height = imageData.height;
    ref.current.getContext('2d')!.putImageData(imageData, 0, 0);
  }, [imageData]);
  return <canvas ref={ref} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />;
}
