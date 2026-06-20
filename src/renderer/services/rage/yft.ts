// YFT (fragment / drawable) geometry parser for GTA V vehicles.
//
// GTA V .yft = RSC7 container wrapping a fragType struct.
//   fragType pgBase @ system:0x00 (vtable 8B + blockmap 8B = 16B)
//   crDrawable embedded directly after pgBase → typically @ system:0x10
//
// crDrawable layout (x64):
//   +0x00 pgBase vtable (8B)
//   +0x08 pgBase blockmap (8B)
//   +0x10 ShaderGroup ptr
//   +0x18 SkeletonData ptr
//   +0x20 BoundingBoxMin (vec4 16B)
//   +0x30 BoundingBoxMax (vec4 16B)
//   +0x40 BoundingCenter (vec4 16B)
//   +0x50 DrawableModelsHigh (ResourcePointerArray64)
//   +0x60 DrawableModelsMed
//   +0x70 DrawableModelsLow
//   +0x80 DrawableModelsVLow
//
// grcGeometryQR (per geometry, x64):
//   +0x00 vtable (8B)
//   +0x08 blockmap (8B)
//   +0x10 VertexBuffers ResourcePointerArray64  (ptr → VB ptr array → grcVertexBuffer)
//   +0x20 IndexBuffers ResourcePointerArray64   (ptr → IB ptr array → grcIndexBuffer)
//
// grcVertexBuffer:
//   +0x10 VertexCount (u16)
//   +0x14 Stride (u16)  [some builds: +0x16]
//   +0x18 VertexData ptr (gfx segment)
//   +0x20 VertexDecl ptr [some builds: +0x28]

import { unpackRSC7Detailed, ResourceReader } from './resource';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface ParsedGeometry {
  name: string;
  positions: Float32Array;
  uvs: Float32Array | null;
  normals: Float32Array | null;
  indices: Uint32Array;
  shaderIndex: number;
  vertexStride: number;
  fvf: number;
}

export interface ParsedShader {
  index: number;
  filename: string;
  textureParams: string[];
}

export interface ParsedDrawable {
  geometries: ParsedGeometry[];
  shaders: ParsedShader[];
  shaderTextureNames: (string | null)[];
  diagnostics: YftDiagnostics;
}

export interface YftDiagnostics {
  // RSC7 header
  rsc7Magic: boolean;
  rsc7Version: number;
  rsc7SystemFlags: string;
  rsc7GraphicsFlags: string;
  rsc7SystemSize: number;
  rsc7GraphicsSize: number;
  // Decompression
  decompressMethod: string;
  decompressedSize: number;
  payloadPeekHex: string;
  failReason: string;
  decompressAttemptLog: string[];
  // Buffer scan
  sysPtrCount: number;
  gfxPtrCount: number;
  maxSysPtrOff: number;
  maxGfxPtrOff: number;
  sysSizeUsed: number;
  sysSizeSource: string;
  // Probe results
  probeResults: Array<{ base: number; score: number; desc: string }>;
  drawableBase: number;
  drawableLodUsed: string;
  // Shader group
  shaderGroupPtrRaw: string;
  shaderGroupBase: number;
  shaderCount: number;
  shaders: Array<{ filename: string; textureParams: string[] }>;
  // Geometry
  modelsFound: number;
  geometryCount: number;
  totalVertices: number;
  totalTriangles: number;
  vertexStrides: number[];
  // Hex dumps
  bufferHex: string;         // first 0x200 bytes of decompressed buffer
  drawableHeaderHex: string; // 0xA0 bytes at drawable base
  // Investigation log (all decisions, every ptr tried)
  investigationLog: string[];
  // Legacy
  systemHeaderHex: string;
  errors: string[];
  warnings: string[];
  notes: string[];
}

export interface YftParseResult {
  drawable: ParsedDrawable | null;
  reason?: string;
  diagnostics: YftDiagnostics;
}

// ── Half-precision float ─────────────────────────────────────────────────────

function decodeHalf(h: number): number {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0)  return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

// ── FVF vertex layout ────────────────────────────────────────────────────────

const FVF_ELEMENTS: { bit: number; size: number; name: string }[] = [
  { bit: 1 << 0,  size: 12, name: 'position'     },
  { bit: 1 << 1,  size: 16, name: 'blendweights' },
  { bit: 1 << 2,  size:  4, name: 'blendindices' },
  { bit: 1 << 3,  size: 12, name: 'normal'       },
  { bit: 1 << 4,  size:  4, name: 'color0'       },
  { bit: 1 << 5,  size:  4, name: 'color1'       },
  { bit: 1 << 6,  size:  4, name: 'texcoord0'    },
  { bit: 1 << 7,  size:  4, name: 'texcoord1'    },
  { bit: 1 << 8,  size:  4, name: 'texcoord2'    },
  { bit: 1 << 9,  size:  4, name: 'texcoord3'    },
  { bit: 1 << 10, size:  4, name: 'texcoord4'    },
  { bit: 1 << 11, size:  4, name: 'texcoord5'    },
  { bit: 1 << 12, size:  4, name: 'texcoord6'    },
  { bit: 1 << 13, size:  4, name: 'texcoord7'    },
  { bit: 1 << 14, size: 16, name: 'tangent'      },
  { bit: 1 << 15, size: 16, name: 'binormal'     },
];

interface VertexLayout {
  posOff: number;
  normalOff: number;
  uvOff: number;
  uvIsHalf: boolean;
  computedStride: number;
}

function decodeVertexLayout(fvf: number, declaredStride: number): VertexLayout {
  let offset = 0;
  const layout: VertexLayout = { posOff: 0, normalOff: -1, uvOff: -1, uvIsHalf: true, computedStride: 0 };
  for (const el of FVF_ELEMENTS) {
    if (!(fvf & el.bit)) continue;
    switch (el.name) {
      case 'position':  layout.posOff    = offset; break;
      case 'normal':    layout.normalOff = offset; break;
      case 'texcoord0': layout.uvOff     = offset; layout.uvIsHalf = true; break;
    }
    offset += el.size;
  }
  layout.computedStride = offset;
  if (offset !== declaredStride && declaredStride >= 12) {
    layout.posOff    = 0;
    layout.normalOff = declaredStride >= 24 ? 12 : -1;
    if (declaredStride >= 32) { layout.uvOff = declaredStride - 4; layout.uvIsHalf = true; }
  }
  return layout;
}

// ── Safe-read helpers ────────────────────────────────────────────────────────

function su8(r: ResourceReader, o: number)  { return (o >= 0 && o + 1 <= r.res.buffer.length) ? r.u8(o) : 0; }
function su16(r: ResourceReader, o: number) { return (o >= 0 && o + 2 <= r.res.buffer.length) ? r.u16(o) : 0; }
function su32(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.u32(o) : 0; }
function sf32(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.f32(o) : 0; }
function sptr(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.ptr(o) : 0; }

// ── Hex dump ─────────────────────────────────────────────────────────────────

function hexDump(buf: Uint8Array, off: number, len: number): string {
  const out: string[] = [];
  const end = Math.min(off + len, buf.length);
  for (let i = off; i < end; i += 16) {
    const row: string[] = [];
    for (let j = 0; j < 16 && i + j < end; j++)
      row.push(buf[i + j].toString(16).padStart(2, '0'));
    const ascii = Array.from({ length: Math.min(16, end - i) }, (_, j) => {
      const c = buf[i + j]; return (c >= 32 && c < 127) ? String.fromCharCode(c) : '.';
    }).join('');
    out.push(`+${(i - off).toString(16).padStart(4, '0')}  ${row.join(' ').padEnd(47)}  ${ascii}`);
  }
  return out.join('\n');
}

// ── ResourcePointerArray64 reader ─────────────────────────────────────────────

function readPtrArray(r: ResourceReader, base: number, tag: string, diag: YftDiagnostics): number[] {
  const arrPtr = sptr(r, base);
  const count  = su16(r, base + 8);
  if (!arrPtr || count === 0 || count > 2048) return [];
  const arrOff = r.resolve(arrPtr);
  if (arrOff < 0) {
    diag.warnings.push(`${tag}: array ptr 0x${arrPtr.toString(16)} → unresolved (sysSize=0x${r.sysSize.toString(16)})`);
    return [];
  }
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    const p   = sptr(r, arrOff + i * 8);
    const res = r.resolve(p);
    if (res >= 0) results.push(res);
    else diag.warnings.push(`${tag}[${i}]: ptr 0x${p.toString(16)} → unresolved`);
  }
  return results;
}

// ── Shader group ─────────────────────────────────────────────────────────────

function looksLikeTextureName(s: string): boolean {
  return /^[a-zA-Z0-9_]{2,64}$/.test(s) && !/\.(sps|fx|pso|vso)$/.test(s);
}

function readShaderGroup(r: ResourceReader, sgPtr: number, diag: YftDiagnostics): ParsedShader[] {
  const sg = r.resolve(sgPtr);
  if (sg < 0) { diag.warnings.push(`ShaderGroup ptr 0x${sgPtr.toString(16)} unresolved`); return []; }

  const shaderBases = readPtrArray(r, sg + 0x18, 'ShaderGroup.Shaders', diag);
  diag.shaderCount = shaderBases.length;

  const parsedShaders: ParsedShader[] = [];
  for (let si = 0; si < shaderBases.length; si++) {
    const shBase = shaderBases[si];
    let filename = '';
    const textureParams: string[] = [];
    for (const off of [0x38, 0x40, 0x48, 0x30, 0x28]) {
      const p = sptr(r, shBase + off);
      const res = r.resolve(p);
      if (res < 0) continue;
      const s = r.str(res, 64);
      if (s.endsWith('.sps') || s.endsWith('.fxc')) { filename = s; break; }
    }
    for (let o = 0x10; o < 0x80; o += 8) {
      const p = sptr(r, shBase + o);
      if (((p >>> 28) & 0xf) !== 0x5) continue;
      const texOff = r.resolve(p);
      if (texOff < 0) continue;
      for (const nameSlot of [0x18, 0x20, 0x28, 0x10]) {
        const np = sptr(r, texOff + nameSlot);
        const nr = r.resolve(np);
        if (nr < 0) continue;
        const nm = r.str(nr, 64);
        if (looksLikeTextureName(nm) && !textureParams.includes(nm)) { textureParams.push(nm); break; }
      }
    }
    parsedShaders.push({ index: si, filename, textureParams });
    diag.shaders.push({ filename: filename || `shader_${si}`, textureParams });
  }
  return parsedShaders;
}

// ── Vertex buffer ─────────────────────────────────────────────────────────────

interface VBResult { positions: Float32Array; uvs: Float32Array | null; normals: Float32Array | null; stride: number; fvf: number; }

function readVertexBuffer(r: ResourceReader, vbBase: number, diag: YftDiagnostics): VBResult | null {
  const vertCountA = su16(r, vbBase + 0x10);
  const strideA    = su16(r, vbBase + 0x14);
  const strideB    = su16(r, vbBase + 0x16);
  let stride = (strideA >= 12 && strideA <= 256) ? strideA : strideB;
  let vertCount = vertCountA;
  if (vertCount === 0) { const v32 = su32(r, vbBase + 0x10); if (v32 > 0 && v32 <= 200_000) vertCount = v32; }

  const vDataPtr  = sptr(r, vbBase + 0x18);
  const vDeclPtrA = sptr(r, vbBase + 0x20);
  const vDeclPtrB = sptr(r, vbBase + 0x28);
  const vDeclPtr  = r.resolve(vDeclPtrA) >= 0 ? vDeclPtrA : vDeclPtrB;

  if (vertCount === 0 || vertCount > 200_000 || stride < 12 || stride > 256) {
    diag.warnings.push(`VB@0x${vbBase.toString(16)}: bad count=${vertCount} stride=${stride} (+0x14=${strideA} +0x16=${strideB})`);
    return null;
  }

  const vDataOff = r.resolve(vDataPtr);
  if (vDataOff < 0) {
    diag.warnings.push(`VB@0x${vbBase.toString(16)}: data ptr 0x${vDataPtr.toString(16)} unresolved`);
    return null;
  }

  let fvf = 0;
  const vDeclOff = r.resolve(vDeclPtr);
  if (vDeclOff >= 0) fvf = su32(r, vDeclOff);

  const layout = decodeVertexLayout(fvf, stride);
  if (!diag.vertexStrides.includes(stride)) diag.vertexStrides.push(stride);

  const positions = new Float32Array(vertCount * 3);
  const normals   = layout.normalOff >= 0 ? new Float32Array(vertCount * 3) : null;
  const uvs       = layout.uvOff >= 0     ? new Float32Array(vertCount * 2) : null;
  const bufLen    = r.res.buffer.length;

  for (let vi = 0; vi < vertCount; vi++) {
    const vo = vDataOff + vi * stride;
    if (vo + stride > bufLen) { diag.warnings.push(`VB: vertex ${vi} OOB`); break; }

    // GTA V coordinate transform: X right, Y forward→Z up, Z up→-Y (OpenGL Y-up)
    const rx = sf32(r, vo + layout.posOff);
    const ry = sf32(r, vo + layout.posOff + 4);
    const rz = sf32(r, vo + layout.posOff + 8);
    positions[vi * 3] = rx; positions[vi * 3 + 1] = rz; positions[vi * 3 + 2] = -ry;

    if (normals && layout.normalOff >= 0) {
      const nx = sf32(r, vo + layout.normalOff);
      const ny = sf32(r, vo + layout.normalOff + 4);
      const nz = sf32(r, vo + layout.normalOff + 8);
      normals[vi * 3] = nx; normals[vi * 3 + 1] = nz; normals[vi * 3 + 2] = -ny;
    }

    if (uvs && layout.uvOff >= 0) {
      if (layout.uvIsHalf) {
        uvs[vi * 2]     = decodeHalf(su16(r, vo + layout.uvOff));
        uvs[vi * 2 + 1] = 1 - decodeHalf(su16(r, vo + layout.uvOff + 2));
      } else {
        uvs[vi * 2]     = sf32(r, vo + layout.uvOff);
        uvs[vi * 2 + 1] = 1 - sf32(r, vo + layout.uvOff + 4);
      }
    }
  }

  return { positions, uvs, normals, stride, fvf };
}

// ── Index buffer ──────────────────────────────────────────────────────────────

function readIndexBuffer(r: ResourceReader, ibBase: number, diag: YftDiagnostics): Uint32Array | null {
  const idxCount = su32(r, ibBase + 0x10);
  if (idxCount === 0 || idxCount > 5_000_000) {
    diag.warnings.push(`IB@0x${ibBase.toString(16)}: bad idxCount=${idxCount}`);
    return null;
  }
  const iDataPtr = sptr(r, ibBase + 0x18);
  const iDataOff = r.resolve(iDataPtr);
  if (iDataOff < 0) { diag.warnings.push(`IB@0x${ibBase.toString(16)}: data ptr unresolved`); return null; }

  const bufLen  = r.res.buffer.length;
  const indices = new Uint32Array(idxCount);
  for (let ii = 0; ii < idxCount; ii++) {
    const iOff = iDataOff + ii * 2;
    if (iOff + 2 > bufLen) { diag.warnings.push(`IB: index ${ii} OOB`); break; }
    indices[ii] = su16(r, iOff);
  }
  return indices;
}

// ── Geometry (two-level VB/IB dereference) ────────────────────────────────────

function resolveArrayElement0(r: ResourceReader, arrayFieldBase: number): number {
  const arrayPtr = sptr(r, arrayFieldBase);
  const arrayOff = r.resolve(arrayPtr);
  if (arrayOff < 0) return -1;
  const elemPtr = sptr(r, arrayOff);
  return r.resolve(elemPtr);
}

function readGeometry(
  r: ResourceReader, geoBase: number, shaderIndex: number,
  geoIdx: number, diag: YftDiagnostics
): ParsedGeometry | null {
  // geoBase+0x10 and +0x20 are ResourcePointerArray64 → need 2-level resolve.
  let vbOff = resolveArrayElement0(r, geoBase + 0x10);
  let ibOff = resolveArrayElement0(r, geoBase + 0x20);

  // Validate 2-level result; fall back to direct resolve if it looks wrong.
  if (vbOff >= 0) {
    const vc = su16(r, vbOff + 0x10), st = su16(r, vbOff + 0x14);
    if (vc === 0 || vc > 200_000 || st < 12 || st > 256) vbOff = -1;
  }
  if (vbOff < 0) {
    const fb = r.resolve(sptr(r, geoBase + 0x10));
    const vc = su16(r, fb + 0x10), st = su16(r, fb + 0x14);
    if (vc > 0 && vc <= 200_000 && st >= 12 && st <= 256) vbOff = fb;
  }

  if (ibOff >= 0) {
    const ic = su32(r, ibOff + 0x10);
    if (ic === 0 || ic > 5_000_000) ibOff = -1;
  }
  if (ibOff < 0) {
    const fb = r.resolve(sptr(r, geoBase + 0x20));
    const ic = su32(r, fb + 0x10);
    if (ic > 0 && ic <= 5_000_000) ibOff = fb;
  }

  if (vbOff < 0) { diag.warnings.push(`Geo[${geoIdx}]@0x${geoBase.toString(16)}: VB unresolved`); return null; }
  if (ibOff < 0) { diag.warnings.push(`Geo[${geoIdx}]@0x${geoBase.toString(16)}: IB unresolved`); return null; }

  const vb = readVertexBuffer(r, vbOff, diag);
  if (!vb) return null;

  const indices = readIndexBuffer(r, ibOff, diag);
  if (!indices) return null;

  let inRange = 0;
  for (let i = 0; i < Math.min(vb.positions.length / 3, 20); i++) {
    const x = vb.positions[i * 3], y = vb.positions[i * 3 + 1], z = vb.positions[i * 3 + 2];
    if (Math.abs(x) < 50 && Math.abs(y) < 50 && Math.abs(z) < 50 && !isNaN(x)) inRange++;
  }
  if (inRange === 0 && vb.positions.length > 0)
    diag.warnings.push(`Geo[${geoIdx}]: no positions in vehicle range (first 20 checked) — stride/FVF mismatch?`);

  diag.totalVertices  += vb.positions.length / 3;
  diag.totalTriangles += indices.length / 3;

  return {
    name: `geo_${geoIdx}`, positions: vb.positions, uvs: vb.uvs, normals: vb.normals,
    indices, shaderIndex, vertexStride: vb.stride, fvf: vb.fvf,
  };
}

// ── Drawable model ────────────────────────────────────────────────────────────

function readDrawableModel(
  r: ResourceReader, modelBase: number, modelIdx: number,
  shaderCount: number, diag: YftDiagnostics
): ParsedGeometry[] {
  const geoBases = readPtrArray(r, modelBase + 0x10, `Model[${modelIdx}].Geometries`, diag);
  if (geoBases.length === 0) {
    diag.warnings.push(`Model[${modelIdx}]@0x${modelBase.toString(16)}: no geometries`);
    return [];
  }
  const smPtr   = sptr(r, modelBase + 0x50);
  const smCount = su16(r, modelBase + 0x58);
  const smOff   = r.resolve(smPtr);
  const shaderMap: number[] = [];
  if (smOff >= 0 && smCount > 0 && smCount <= 512)
    for (let gi = 0; gi < smCount; gi++) shaderMap.push(su16(r, smOff + gi * 2));

  const geos: ParsedGeometry[] = [];
  for (let gi = 0; gi < geoBases.length; gi++) {
    const shIdx = (gi < shaderMap.length && shaderMap[gi] < Math.max(shaderCount, 1)) ? shaderMap[gi] : 0;
    try {
      const g = readGeometry(r, geoBases[gi], shIdx, diag.geometryCount + gi, diag);
      if (g) geos.push(g);
    } catch (e: any) { diag.warnings.push(`Geo[${gi}] threw: ${e?.message || e}`); }
  }
  diag.geometryCount += geos.length;
  return geos;
}

// ── Investigation: full-buffer RAGE pointer scan ──────────────────────────────

interface ScanResult {
  sysPtrCount: number;
  gfxPtrCount: number;
  maxSysPtrOff: number;
  maxGfxPtrOff: number;
  sysPtrSample: string; // first few sys ptr positions
}

function scanRagePtrs(buf: Uint8Array): ScanResult {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let sysPtrCount = 0, gfxPtrCount = 0, maxSysOff = 0, maxGfxOff = 0;
  const samples: string[] = [];
  const limit = Math.min(buf.length - 3, 0x20000);

  for (let i = 0; i < limit; i += 4) {
    const v = dv.getUint32(i, true);
    const seg = (v >>> 28) & 0xf;
    const off = v & 0x0fffffff;
    if (seg === 5) {
      sysPtrCount++;
      if (off > maxSysOff) maxSysOff = off;
      if (samples.length < 8) samples.push(`@0x${i.toString(16)}=0x${v.toString(16)}`);
    } else if (seg === 6) {
      gfxPtrCount++;
      if (off > maxGfxOff) maxGfxOff = off;
    }
  }
  return { sysPtrCount, gfxPtrCount, maxSysPtrOff: maxSysOff, maxGfxPtrOff: maxGfxOff, sysPtrSample: samples.join(', ') };
}

// ── Drawable scoring with explicit sysSize ────────────────────────────────────

interface ProbeCandidate { base: number; score: number; desc: string; lodOffset: number; lodName: string; }

function scoreDrawableBase(r: ResourceReader, base: number, bufLen: number): ProbeCandidate {
  let score = 0;
  const notes: string[] = [];
  let bestLodOff = 0x50, bestLodName = 'High';

  const lodDefs = [
    { off: 0x50, name: 'High', weight: 50 },
    { off: 0x60, name: 'Med',  weight: 30 },
    { off: 0x70, name: 'Low',  weight: 20 },
    { off: 0x80, name: 'VLow', weight: 10 },
  ];
  for (const lod of lodDefs) {
    if (base + lod.off + 10 > bufLen) continue;
    const ptr   = sptr(r, base + lod.off);
    const off   = r.resolve(ptr);
    const count = su16(r, base + lod.off + 8);
    if (off >= 0 && count > 0 && count <= 256) {
      score += lod.weight;
      notes.push(`Models${lod.name}:${count}`);
      if (lod.name === 'High') { bestLodOff = lod.off; bestLodName = lod.name; }
      else if (bestLodOff !== 0x50) { bestLodOff = lod.off; bestLodName = lod.name; }
    }
  }

  if (base + 0x1A <= bufLen) {
    const sgPtr = sptr(r, base + 0x10);
    const sgOff = r.resolve(sgPtr);
    if (sgOff >= 0 && sgOff < bufLen) {
      const shPtr   = sptr(r, sgOff + 0x18);
      const shOff   = r.resolve(shPtr);
      const shCount = su16(r, sgOff + 0x20);
      if (shOff >= 0 && shCount > 0 && shCount <= 256) { score += 20; notes.push(`SG:${shCount}sh`); }
      else if (sgOff >= 0) { score += 5; notes.push(`SG(no-sh)`); }
    }
  }

  if (base + 0x3C <= bufLen) {
    const bx = sf32(r, base + 0x30), by = sf32(r, base + 0x34), bz = sf32(r, base + 0x38);
    if (isFinite(bx) && isFinite(by) && isFinite(bz) &&
        (Math.abs(bx) > 0.001 || Math.abs(by) > 0.001) &&
        Math.abs(bx) < 500 && Math.abs(by) < 500 && Math.abs(bz) < 500) {
      score += 5; notes.push(`BBox(${bx.toFixed(1)},${by.toFixed(1)},${bz.toFixed(1)})`);
    }
  }

  return { base, score, lodOffset: bestLodOff, lodName: bestLodName, desc: notes.join(' ') || 'no signals' };
}

// ── Adaptive sysSize detection + full-buffer probe ────────────────────────────

function findDrawableAdaptive(r: ResourceReader, scan: ScanResult, diag: YftDiagnostics): ProbeCandidate | null {
  const buf = r.res.buffer;
  const bufLen = buf.length;
  const log = diag.investigationLog;

  // Build candidate sysSize list to try
  const flagsSysSize = r.res.systemSize;
  // Adaptive: highest sys ptr offset + safety margin
  const adaptiveSysSize = scan.maxSysPtrOff > 0
    ? Math.min(Math.ceil((scan.maxSysPtrOff + 0x2000) / 0x1000) * 0x1000, bufLen)
    : bufLen;

  const sysSizesToTry: Array<{ size: number; label: string }> = [];
  if (flagsSysSize > 0 && flagsSysSize <= bufLen)
    sysSizesToTry.push({ size: flagsSysSize, label: 'from RSC7 flags' });
  if (adaptiveSysSize !== flagsSysSize)
    sysSizesToTry.push({ size: adaptiveSysSize, label: 'adaptive (max sys ptr + 0x2000)' });
  sysSizesToTry.push({ size: bufLen, label: 'whole buffer as system' });

  log.push(`\n=== SYSSIZE CANDIDATES ===`);
  for (const s of sysSizesToTry) log.push(`  0x${s.size.toString(16)} (${s.label})`);

  let bestCandidate: ProbeCandidate | null = null;
  let bestSysSize = sysSizesToTry[0]?.size ?? bufLen;

  for (const { size, label } of sysSizesToTry) {
    r.sysSize = size;
    log.push(`\n--- Probing with sysSize=0x${size.toString(16)} (${label}) ---`);

    // Scan entire system segment in 8-byte steps
    const scanLimit = Math.min(size, 0x4000); // scan first 16K of sys segment
    const candidates: ProbeCandidate[] = [];

    // Also try ptr-resolved addresses from first 0x80 of buffer
    const extraBases = new Set<number>();
    for (let off = 0; off < Math.min(0x80, bufLen - 4); off += 8) {
      const p = sptr(r, off);
      const res = r.resolve(p);
      if (res > 0 && res < size) {
        for (let d = -0x20; d <= 0x40; d += 8) {
          const candidate = res + d;
          if (candidate >= 0 && candidate + 0x60 < bufLen) extraBases.add(candidate);
        }
      }
    }

    for (let base = 0; base < scanLimit; base += 8) {
      if (base + 0x60 > bufLen) break;
      const c = scoreDrawableBase(r, base, bufLen);
      if (c.score > 0) candidates.push(c);
    }
    for (const base of extraBases) {
      if (base + 0x60 > bufLen) continue;
      const c = scoreDrawableBase(r, base, bufLen);
      if (c.score > 0 && !candidates.find(x => x.base === base)) candidates.push(c);
    }

    candidates.sort((a, b) => b.score - a.score);

    log.push(`  Scanned 0x00-0x${scanLimit.toString(16)} + ${extraBases.size} ptr-derived bases`);
    log.push(`  Candidates with score > 0: ${candidates.length}`);
    for (const c of candidates.slice(0, 15)) {
      log.push(`    base=0x${c.base.toString(16)} score=${c.score} → ${c.desc}`);
    }

    // Record all in diagnostics
    for (const c of candidates) diag.probeResults.push({ base: c.base, score: c.score, desc: c.desc });

    const top = candidates[0];
    if (top && top.score >= 20 && (!bestCandidate || top.score > bestCandidate.score)) {
      bestCandidate = top;
      bestSysSize = size;
    } else if (top && top.score < 20) {
      log.push(`  Best score ${top.score} < threshold 20 — not accepted`);
    }
  }

  // Deduplicate probe results
  const seen = new Set<string>();
  diag.probeResults = diag.probeResults.filter(p => {
    const key = `${p.base}_${p.score}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  diag.probeResults.sort((a, b) => b.score - a.score);

  if (bestCandidate) {
    r.sysSize = bestSysSize;
    diag.sysSizeUsed = bestSysSize;
    diag.sysSizeSource = bestSysSize === flagsSysSize ? 'RSC7 flags'
      : bestSysSize === adaptiveSysSize ? 'adaptive' : 'whole buffer';
    diag.drawableBase    = bestCandidate.base;
    diag.drawableLodUsed = bestCandidate.lodName;
    log.push(`\n✓ WINNER: base=0x${bestCandidate.base.toString(16)} score=${bestCandidate.score} (${bestCandidate.desc}) sysSize=0x${bestSysSize.toString(16)}`);
    return bestCandidate;
  }

  const top = diag.probeResults[0];
  log.push(`\n✗ No drawable found. Best score=${top?.score ?? 0} at 0x${top?.base?.toString(16) ?? '?'}`);
  if (scan.sysPtrCount === 0) {
    log.push(`  CRITICAL: zero RAGE system pointers found in buffer.`);
    log.push(`  This means the data is still compressed or in an unknown format.`);
  }
  diag.errors.push(
    `No valid drawable found (score < 20). Best=${top?.score ?? 0}@0x${top?.base?.toString(16) ?? '?'}. ` +
    `sysPtrs=${scan.sysPtrCount} gfxPtrs=${scan.gfxPtrCount}.`
  );
  return null;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function parseYftGeometry(buffer: ArrayBuffer): Promise<YftParseResult> {
  const diag: YftDiagnostics = {
    rsc7Magic: false, rsc7Version: 0,
    rsc7SystemFlags: '', rsc7GraphicsFlags: '',
    rsc7SystemSize: 0, rsc7GraphicsSize: 0,
    decompressMethod: 'failed', decompressedSize: 0,
    payloadPeekHex: '', failReason: '',
    decompressAttemptLog: [],
    sysPtrCount: 0, gfxPtrCount: 0, maxSysPtrOff: 0, maxGfxPtrOff: 0,
    sysSizeUsed: 0, sysSizeSource: '',
    probeResults: [], drawableBase: -1, drawableLodUsed: '',
    shaderGroupPtrRaw: '', shaderGroupBase: -1, shaderCount: 0, shaders: [],
    modelsFound: 0, geometryCount: 0, totalVertices: 0, totalTriangles: 0,
    vertexStrides: [],
    bufferHex: '', drawableHeaderHex: '',
    investigationLog: [],
    systemHeaderHex: '',
    errors: [], warnings: [], notes: [],
  };

  const log = diag.investigationLog;
  const bytes = new Uint8Array(buffer);

  diag.rsc7Magic = bytes.length >= 4 &&
    bytes[0] === 0x52 && bytes[1] === 0x53 && bytes[2] === 0x43 && bytes[3] === 0x37;

  log.push(`=== YFT INVESTIGATION ===`);
  log.push(`File size: ${bytes.length} bytes (0x${bytes.length.toString(16)})`);
  log.push(`RSC7 magic: ${diag.rsc7Magic ? 'YES' : 'NO'}`);

  // ── Decompress ──────────────────────────────────────────────────────────────
  const unpack = await unpackRSC7Detailed(bytes);
  diag.rsc7Version       = unpack.version;
  diag.rsc7SystemFlags   = `0x${unpack.systemFlags.toString(16)}`;
  diag.rsc7GraphicsFlags = `0x${unpack.graphicsFlags.toString(16)}`;
  diag.rsc7SystemSize    = unpack.systemSize;
  diag.rsc7GraphicsSize  = unpack.graphicsSize;
  diag.decompressMethod  = unpack.method;
  diag.decompressedSize  = unpack.decompressedSize;
  diag.payloadPeekHex    = unpack.payloadPeekHex;
  diag.failReason        = unpack.failReason ?? '';
  diag.decompressAttemptLog = unpack.attemptLog;

  log.push(`\n=== DECOMPRESSION ===`);
  for (const line of unpack.attemptLog) log.push(line);
  log.push(`\nResult: method=${unpack.method}, size=${unpack.decompressedSize}`);

  if (!unpack.resource) {
    const reason = unpack.failReason || 'RSC7 decompression failed.';
    diag.errors.push(reason);
    log.push(`FATAL: ${reason}`);
    return { drawable: null, reason, diagnostics: diag };
  }

  const res = unpack.resource;
  const buf = res.buffer;
  diag.bufferHex = hexDump(buf, 0, Math.min(0x200, buf.length));
  diag.systemHeaderHex = diag.bufferHex; // legacy alias

  log.push(`\n=== BUFFER FIRST 0x40 BYTES ===`);
  log.push(hexDump(buf, 0, Math.min(0x40, buf.length)));

  // ── Scan for RAGE pointers ─────────────────────────────────────────────────
  log.push(`\n=== RAGE POINTER SCAN ===`);
  const scan = scanRagePtrs(buf);
  diag.sysPtrCount  = scan.sysPtrCount;
  diag.gfxPtrCount  = scan.gfxPtrCount;
  diag.maxSysPtrOff = scan.maxSysPtrOff;
  diag.maxGfxPtrOff = scan.maxGfxPtrOff;

  log.push(`System ptrs (0x5XXXXXXX): ${scan.sysPtrCount}, max offset: 0x${scan.maxSysPtrOff.toString(16)}`);
  log.push(`Graphics ptrs (0x6XXXXXXX): ${scan.gfxPtrCount}, max offset: 0x${scan.maxGfxPtrOff.toString(16)}`);
  if (scan.sysPtrSample) log.push(`First sys ptr positions: ${scan.sysPtrSample}`);

  if (scan.sysPtrCount === 0) {
    log.push(`CRITICAL: No system pointers found. Data is likely still compressed or wrong format.`);
    const reason = `No RAGE system pointers in decompressed buffer. Method=${unpack.method}. The file may use a non-standard compression or encryption.`;
    diag.errors.push(reason);
    return { drawable: null, reason, diagnostics: diag };
  }

  // ── Find drawable ──────────────────────────────────────────────────────────
  const r = new ResourceReader(res);
  const candidate = findDrawableAdaptive(r, scan, diag);

  if (!candidate) {
    return { drawable: null, reason: diag.errors.join('; ') || 'Drawable not found.', diagnostics: diag };
  }

  const drawableBase = candidate.base;
  diag.drawableHeaderHex = hexDump(buf, drawableBase, Math.min(0xa0, buf.length - drawableBase));

  log.push(`\n=== DRAWABLE HEADER @ 0x${drawableBase.toString(16)} ===`);
  log.push(diag.drawableHeaderHex);

  // ── Shader group ───────────────────────────────────────────────────────────
  const sgPtr = sptr(r, drawableBase + 0x10);
  diag.shaderGroupPtrRaw = `0x${sgPtr.toString(16)}`;
  diag.shaderGroupBase   = r.resolve(sgPtr);
  log.push(`\nShaderGroup ptr=0x${sgPtr.toString(16)} → offset=0x${diag.shaderGroupBase.toString(16)}`);

  let shaders: ParsedShader[] = [];
  if (diag.shaderGroupBase >= 0) {
    try { shaders = readShaderGroup(r, sgPtr, diag); }
    catch (e: any) { diag.warnings.push(`ShaderGroup threw: ${e?.message || e}`); }
  }
  log.push(`Shaders found: ${shaders.length}`);

  // ── DrawableModels — try all LODs ──────────────────────────────────────────
  const lodDefs = [
    { off: 0x50, name: 'High' }, { off: 0x60, name: 'Med' },
    { off: 0x70, name: 'Low'  }, { off: 0x80, name: 'VLow' },
  ];

  let modelBases: number[] = [];
  let lodUsedName = '';
  for (const lod of lodDefs) {
    const bases = readPtrArray(r, drawableBase + lod.off, `DrawableModels${lod.name}`, diag);
    log.push(`LOD ${lod.name} @ 0x${(drawableBase + lod.off).toString(16)}: ptr=0x${sptr(r, drawableBase + lod.off).toString(16)} count=${su16(r, drawableBase + lod.off + 8)} resolved=${bases.length}`);
    if (bases.length > 0 && modelBases.length === 0) {
      modelBases = bases;
      lodUsedName = lod.name;
      diag.drawableLodUsed = lod.name;
    }
  }

  diag.modelsFound = modelBases.length;
  log.push(`\nModels to parse: ${modelBases.length} (LOD=${lodUsedName})`);

  if (modelBases.length === 0) {
    return { drawable: null, reason: `All LOD levels resolved 0 models from drawable@0x${drawableBase.toString(16)}.`, diagnostics: diag };
  }

  // ── Geometries ─────────────────────────────────────────────────────────────
  const geometries: ParsedGeometry[] = [];
  for (let mi = 0; mi < modelBases.length; mi++) {
    try {
      const geos = readDrawableModel(r, modelBases[mi], mi, shaders.length, diag);
      geometries.push(...geos);
    } catch (e: any) { diag.errors.push(`Model[${mi}] threw: ${e?.message || e}`); }
  }

  log.push(`\nGeometries decoded: ${geometries.length}`);
  log.push(`Total vertices: ${diag.totalVertices}`);
  log.push(`Total triangles: ${diag.totalTriangles}`);

  if (geometries.length === 0) {
    return {
      drawable: null,
      reason: `${modelBases.length} models found but 0 geometries decoded. Errors: ${diag.errors.slice(0, 3).join('; ')}`,
      diagnostics: diag,
    };
  }

  diag.notes.push(
    `OK: ${geometries.length} geom, ${diag.totalVertices} verts, ${diag.totalTriangles} tris, ` +
    `${shaders.length} shaders, LOD=${lodUsedName}, base=0x${drawableBase.toString(16)}, ` +
    `decompress=${unpack.method}, sysSize=0x${r.sysSize.toString(16)} (${diag.sysSizeSource}).`
  );

  return {
    drawable: {
      geometries, shaders,
      shaderTextureNames: shaders.map(s => s.textureParams[0] ?? null),
      diagnostics: diag,
    },
    diagnostics: diag,
  };
}
