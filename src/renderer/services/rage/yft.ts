// YFT (fragment / drawable) geometry parser for GTA V vehicles.
//
// GTA V .yft = RSC7 container wrapping a fragType struct.
// fragType has a pgBase (16 bytes) followed by an embedded crDrawable.
// crDrawable layout:
//   +0x00: pgBase (vtable 8b + blockmap 8b)
//   +0x10: ShaderGroup ptr
//   +0x18: SkeletonData ptr
//   +0x20: BoundingBoxMin (Vector4 16b)
//   +0x30: BoundingBoxMax (Vector4 16b)
//   +0x40: BoundingCenter (Vector4 16b)
//   +0x50: DrawableModelsHigh (ResourcePointerArray64)
//   +0x60: DrawableModelsMed
//   +0x70: DrawableModelsLow
//   +0x80: DrawableModelsVLow
//
// For .yft: fragType pgBase is at system:0x00, so crDrawable starts at system:0x10.
// For .ydr: crDrawable is directly at system:0x00.
// We probe both and all 8-byte-aligned offsets 0x00–0x100 with a scoring system.

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
  decompressMethod: string;
  decompressedSize: number;
  payloadPeekHex: string;
  failReason: string;
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
  systemHeaderHex: string;
  drawableHeaderHex: string;
  // Log
  errors: string[];
  warnings: string[];
  notes: string[];
}

export interface YftParseResult {
  drawable: ParsedDrawable | null;
  reason?: string;
  diagnostics: YftDiagnostics;
}

// ── Half-precision float decode ──────────────────────────────────────────────

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

  // Fallback when FVF gives wrong stride.
  if (offset !== declaredStride && declaredStride >= 12) {
    layout.posOff    = 0;
    layout.normalOff = declaredStride >= 24 ? 12 : -1;
    if (declaredStride >= 32) {
      layout.uvOff    = declaredStride - 4;
      layout.uvIsHalf = true;
    }
  }
  return layout;
}

// ── Safe read helpers ────────────────────────────────────────────────────────

function su8(r: ResourceReader, o: number)  { return (o >= 0 && o + 1 <= r.res.buffer.length) ? r.u8(o) : 0; }
function su16(r: ResourceReader, o: number) { return (o >= 0 && o + 2 <= r.res.buffer.length) ? r.u16(o) : 0; }
function su32(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.u32(o) : 0; }
function sf32(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.f32(o) : 0; }
function sptr(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.ptr(o) : 0; }

/** Read a ResourcePointerArray64; returns resolved offsets for each entry. */
function readPtrArray(r: ResourceReader, base: number, tag: string, diag: YftDiagnostics): number[] {
  const arrPtr = sptr(r, base);
  const count  = su16(r, base + 8);
  if (!arrPtr || count === 0 || count > 2048) return [];
  const arrOff = r.resolve(arrPtr);
  if (arrOff < 0) {
    diag.warnings.push(`${tag}: array ptr 0x${arrPtr.toString(16)} did not resolve`);
    return [];
  }
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    const p   = sptr(r, arrOff + i * 8);
    const res = r.resolve(p);
    if (res >= 0) results.push(res);
    else diag.warnings.push(`${tag}[${i}]: ptr 0x${p.toString(16)} unresolved`);
  }
  return results;
}

// ── Hex dump ─────────────────────────────────────────────────────────────────

function hexDump(buf: Uint8Array, off: number, len: number): string {
  const out: string[] = [];
  const end = Math.min(off + len, buf.length);
  for (let i = off; i < end; i += 16) {
    const row: string[] = [];
    for (let j = 0; j < 16 && i + j < end; j++)
      row.push(buf[i + j].toString(16).padStart(2, '0'));
    out.push(`+0x${(i - off).toString(16).padStart(3, '0')}  ${row.join(' ')}`);
  }
  return out.join('\n');
}

// ── Shader group parser ──────────────────────────────────────────────────────

function looksLikeTextureName(s: string): boolean {
  return /^[a-zA-Z0-9_]{2,64}$/.test(s) && !/\.(sps|fx|pso|vso)$/.test(s);
}

function readShaderGroup(r: ResourceReader, sgPtr: number, diag: YftDiagnostics): ParsedShader[] {
  const sg = r.resolve(sgPtr);
  if (sg < 0) {
    diag.warnings.push(`ShaderGroup ptr 0x${sgPtr.toString(16)} did not resolve`);
    return [];
  }

  // Shaders ResourcePointerArray64 at sg+0x18
  const shaderBases = readPtrArray(r, sg + 0x18, 'ShaderGroup.Shaders', diag);
  diag.shaderCount = shaderBases.length;

  const parsedShaders: ParsedShader[] = [];
  for (let si = 0; si < shaderBases.length; si++) {
    const shBase       = shaderBases[si];
    let   filename     = '';
    const textureParams: string[] = [];

    // Shader filename: try offsets where GTA V stores the .sps pointer.
    for (const off of [0x38, 0x40, 0x48, 0x30, 0x28]) {
      const p = sptr(r, shBase + off);
      const res = r.resolve(p);
      if (res < 0) continue;
      const s = r.str(res, 64);
      if (s.endsWith('.sps') || s.endsWith('.fxc')) { filename = s; break; }
    }

    // Texture params: scan shader struct for system pointers that lead to
    // objects with a readable ASCII texture name.
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
        if (looksLikeTextureName(nm) && !textureParams.includes(nm)) {
          textureParams.push(nm);
          break;
        }
      }
    }

    parsedShaders.push({ index: si, filename, textureParams });
    diag.shaders.push({ filename: filename || `shader_${si}`, textureParams });
  }
  return parsedShaders;
}

// ── Vertex / index buffer readers ────────────────────────────────────────────

interface VBResult {
  positions: Float32Array;
  uvs: Float32Array | null;
  normals: Float32Array | null;
  stride: number;
  fvf: number;
}

function readVertexBuffer(r: ResourceReader, vbBase: number, diag: YftDiagnostics): VBResult | null {
  const vertCount = su16(r, vbBase + 0x10);
  const stride    = su16(r, vbBase + 0x14);
  const vDataPtr  = sptr(r, vbBase + 0x18);
  const vDeclPtr  = sptr(r, vbBase + 0x20);

  if (vertCount === 0 || vertCount > 200_000 || stride < 12 || stride > 256) {
    diag.warnings.push(`VB@0x${vbBase.toString(16)}: bad count=${vertCount} stride=${stride}`);
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

    positions[vi * 3 + 0] = sf32(r, vo + layout.posOff + 0);
    positions[vi * 3 + 1] = sf32(r, vo + layout.posOff + 4);
    positions[vi * 3 + 2] = sf32(r, vo + layout.posOff + 8);

    if (normals && layout.normalOff >= 0) {
      normals[vi * 3 + 0] = sf32(r, vo + layout.normalOff + 0);
      normals[vi * 3 + 1] = sf32(r, vo + layout.normalOff + 4);
      normals[vi * 3 + 2] = sf32(r, vo + layout.normalOff + 8);
    }

    if (uvs && layout.uvOff >= 0) {
      if (layout.uvIsHalf) {
        uvs[vi * 2 + 0] = decodeHalf(su16(r, vo + layout.uvOff + 0));
        uvs[vi * 2 + 1] = decodeHalf(su16(r, vo + layout.uvOff + 2));
      } else {
        uvs[vi * 2 + 0] = sf32(r, vo + layout.uvOff + 0);
        uvs[vi * 2 + 1] = sf32(r, vo + layout.uvOff + 4);
      }
    }
  }

  return { positions, uvs, normals, stride, fvf };
}

function readIndexBuffer(r: ResourceReader, ibBase: number, diag: YftDiagnostics): Uint32Array | null {
  const idxCount = su32(r, ibBase + 0x10);
  const iDataPtr = sptr(r, ibBase + 0x18);

  if (idxCount === 0 || idxCount > 5_000_000) {
    diag.warnings.push(`IB@0x${ibBase.toString(16)}: bad count=${idxCount}`);
    return null;
  }
  const iDataOff = r.resolve(iDataPtr);
  if (iDataOff < 0) {
    diag.warnings.push(`IB@0x${ibBase.toString(16)}: data ptr unresolved`);
    return null;
  }

  const bufLen  = r.res.buffer.length;
  const indices = new Uint32Array(idxCount);
  for (let ii = 0; ii < idxCount; ii++) {
    const iOff = iDataOff + ii * 2;
    if (iOff + 2 > bufLen) { diag.warnings.push(`IB: index ${ii} OOB`); break; }
    indices[ii] = su16(r, iOff);
  }
  return indices;
}

// ── crGeometry reader ─────────────────────────────────────────────────────────

function readGeometry(
  r: ResourceReader, geoBase: number, shaderIndex: number,
  geoIdx: number, diag: YftDiagnostics
): ParsedGeometry | null {
  const vbPtr = sptr(r, geoBase + 0x10);
  const ibPtr = sptr(r, geoBase + 0x20);
  const vbOff = r.resolve(vbPtr);
  const ibOff = r.resolve(ibPtr);

  if (vbOff < 0) { diag.warnings.push(`Geo[${geoIdx}]: VB unresolved 0x${vbPtr.toString(16)}`); return null; }
  if (ibOff < 0) { diag.warnings.push(`Geo[${geoIdx}]: IB unresolved 0x${ibPtr.toString(16)}`); return null; }

  const vb = readVertexBuffer(r, vbOff, diag);
  if (!vb) return null;

  const indices = readIndexBuffer(r, ibOff, diag);
  if (!indices) return null;

  // Sanity check: at least some positions should be in a vehicle-sized range (±50m).
  let inRange = 0;
  for (let i = 0; i < Math.min(vb.positions.length / 3, 20); i++) {
    const x = vb.positions[i * 3], y = vb.positions[i * 3 + 1], z = vb.positions[i * 3 + 2];
    if (Math.abs(x) < 50 && Math.abs(y) < 50 && Math.abs(z) < 50 && !isNaN(x)) inRange++;
  }
  if (inRange === 0 && vb.positions.length > 0) {
    diag.warnings.push(`Geo[${geoIdx}]: no positions in vehicle range (first 20 checked) — stride/FVF mismatch?`);
  }

  diag.totalVertices  += vb.positions.length / 3;
  diag.totalTriangles += indices.length / 3;

  return {
    name: `geo_${geoIdx}`,
    positions: vb.positions, uvs: vb.uvs, normals: vb.normals,
    indices, shaderIndex, vertexStride: vb.stride, fvf: vb.fvf,
  };
}

// ── crDrawableModel reader ────────────────────────────────────────────────────

function readDrawableModel(
  r: ResourceReader, modelBase: number, modelIdx: number,
  shaderCount: number, diag: YftDiagnostics
): ParsedGeometry[] {
  const geoBases = readPtrArray(r, modelBase + 0x10, `Model[${modelIdx}].Geometries`, diag);
  if (geoBases.length === 0) {
    diag.warnings.push(`Model[${modelIdx}]@0x${modelBase.toString(16)}: no geometries`);
    return [];
  }

  // Shader mappings: one u16 per geometry at modelBase+0x50.
  const smPtr   = sptr(r, modelBase + 0x50);
  const smCount = su16(r, modelBase + 0x58);
  const smOff   = r.resolve(smPtr);
  const shaderMap: number[] = [];
  if (smOff >= 0 && smCount > 0 && smCount <= 512) {
    for (let gi = 0; gi < smCount; gi++) shaderMap.push(su16(r, smOff + gi * 2));
  }

  const geos: ParsedGeometry[] = [];
  for (let gi = 0; gi < geoBases.length; gi++) {
    const shIdx = (gi < shaderMap.length && shaderMap[gi] < Math.max(shaderCount, 1))
      ? shaderMap[gi] : 0;
    try {
      const g = readGeometry(r, geoBases[gi], shIdx, diag.geometryCount + gi, diag);
      if (g) geos.push(g);
    } catch (e: any) {
      diag.warnings.push(`Geo[${gi}] threw: ${e?.message || e}`);
    }
  }
  diag.geometryCount += geos.length;
  return geos;
}

// ── Brute-force scored drawable probe ────────────────────────────────────────
//
// Instead of hard-coding offsets that may vary by GTA V version or export tool,
// we scan all 8-byte-aligned positions from 0x00 to 0x100 and score each candidate
// using multiple independent signals. The highest-scoring candidate wins.
//
// Scoring weights:
//   +50  DrawableModelsHigh resolves (ptr valid + count 1–256)
//   +30  DrawableModelsMed  resolves (ptr valid + count 1–256)
//   +20  DrawableModelsLow  resolves (ptr valid + count 1–256)
//   +20  ShaderGroup ptr at +0x10 resolves AND has a Shaders array at sg+0x18
//   + 5  Bounding box floats at +0x30 are finite and non-zero (vehicle range ±500)
//
// A candidate must score ≥ 20 to be accepted.

interface ProbeCandidate {
  base: number;
  score: number;
  desc: string;
  lodOffset: number;   // relative offset of the best LOD ResourcePointerArray64
  lodName: string;
}

function scoreDrawableBase(r: ResourceReader, base: number, sysLen: number): ProbeCandidate {
  let score = 0;
  const notes: string[] = [];
  let bestLodOff = 0x50;
  let bestLodName = 'High';

  // LOD levels: High=+0x50, Med=+0x60, Low=+0x70, VLow=+0x80
  const lodDefs = [
    { off: 0x50, name: 'High', weight: 50 },
    { off: 0x60, name: 'Med',  weight: 30 },
    { off: 0x70, name: 'Low',  weight: 20 },
    { off: 0x80, name: 'VLow', weight: 10 },
  ];
  for (const lod of lodDefs) {
    const needed = base + lod.off + 10;
    if (needed > sysLen) continue;
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

  // ShaderGroup at +0x10 (standard crDrawable layout)
  if (base + 0x1A <= sysLen) {
    const sgPtr = sptr(r, base + 0x10);
    const sgOff = r.resolve(sgPtr);
    if (sgOff >= 0 && sgOff < sysLen) {
      // Verify: ShaderGroup should have a Shaders array at sg+0x18
      const shPtr   = sptr(r, sgOff + 0x18);
      const shOff   = r.resolve(shPtr);
      const shCount = su16(r, sgOff + 0x20);
      if (shOff >= 0 && shCount > 0 && shCount <= 256) {
        score += 20;
        notes.push(`SG:${shCount}sh`);
      } else if (sgOff >= 0) {
        score += 5; // ptr resolves but inner structure uncertain
        notes.push(`SG(no-sh)`);
      }
    }
  }

  // Bounding box sanity at +0x30 (should be finite floats in ±500 range)
  if (base + 0x3C <= sysLen) {
    const bx = sf32(r, base + 0x30);
    const by = sf32(r, base + 0x34);
    const bz = sf32(r, base + 0x38);
    if (isFinite(bx) && isFinite(by) && isFinite(bz) &&
        (Math.abs(bx) > 0.001 || Math.abs(by) > 0.001) &&
        Math.abs(bx) < 500 && Math.abs(by) < 500 && Math.abs(bz) < 500) {
      score += 5;
      notes.push(`BBox(${bx.toFixed(1)},${by.toFixed(1)},${bz.toFixed(1)})`);
    }
  }

  return {
    base, score, lodOffset: bestLodOff, lodName: bestLodName,
    desc: notes.length ? notes.join(' ') : 'no signals',
  };
}

function findDrawableBase(r: ResourceReader, diag: YftDiagnostics): ProbeCandidate | null {
  const sysLen = r.res.systemSize > 0 ? r.res.systemSize : r.res.buffer.length;

  // Also include ptr-resolved bases from the first 0x40 bytes of the system segment.
  // This covers fragType.Drawable = pointer stored somewhere in the first few fields.
  const ptrBases: number[] = [];
  for (let off = 0; off < Math.min(0x40, sysLen - 4); off += 8) {
    const p = sptr(r, off);
    const resolved = r.resolve(p);
    if (resolved > 0 && resolved < sysLen) ptrBases.push(resolved);
  }

  // Scan: all 8-byte-aligned offsets 0x00 to 0x100, plus any ptr-resolved bases.
  const candidates = new Set<number>();
  for (let b = 0; b <= 0x100; b += 8) candidates.add(b);
  for (const pb of ptrBases) {
    for (let delta = -0x10; delta <= 0x20; delta += 8)
      candidates.add(pb + delta);
  }

  let best: ProbeCandidate | null = null;
  for (const base of candidates) {
    if (base < 0 || base + 0x60 > sysLen) continue;
    const cand = scoreDrawableBase(r, base, sysLen);
    diag.probeResults.push({ base, score: cand.score, desc: cand.desc });
    if (cand.score > (best?.score ?? 0)) best = cand;
  }

  // Sort probe results by score desc for readable diagnostics.
  diag.probeResults.sort((a, b) => b.score - a.score);

  if (best && best.score >= 20) {
    diag.drawableBase  = best.base;
    diag.drawableLodUsed = best.lodName;
    diag.notes.push(`Best drawable base: 0x${best.base.toString(16)} score=${best.score} (${best.desc})`);
    return best;
  }

  const topScore = best?.score ?? 0;
  diag.errors.push(
    `No valid drawable found. Best candidate score=${topScore}` +
    (best ? ` at 0x${best.base.toString(16)} (${best.desc})` : '') +
    `. systemSize=0x${sysLen.toString(16)}.`
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
    probeResults: [], drawableBase: -1, drawableLodUsed: '',
    shaderGroupPtrRaw: '', shaderGroupBase: -1, shaderCount: 0, shaders: [],
    modelsFound: 0, geometryCount: 0, totalVertices: 0, totalTriangles: 0,
    vertexStrides: [], systemHeaderHex: '', drawableHeaderHex: '',
    errors: [], warnings: [], notes: [],
  };

  const bytes = new Uint8Array(buffer);

  // Raw header hex dump (before decompression, always available).
  diag.systemHeaderHex = hexDump(bytes, 0, Math.min(0x40, bytes.length));
  diag.rsc7Magic = bytes.length >= 4 &&
    bytes[0] === 0x52 && bytes[1] === 0x53 && bytes[2] === 0x43 && bytes[3] === 0x37;

  // ── Unpack RSC7 ─────────────────────────────────────────────────────────────
  const unpack = await unpackRSC7Detailed(bytes);

  diag.rsc7Version      = unpack.version;
  diag.rsc7SystemFlags  = `0x${unpack.systemFlags.toString(16)}`;
  diag.rsc7GraphicsFlags= `0x${unpack.graphicsFlags.toString(16)}`;
  diag.rsc7SystemSize   = unpack.systemSize;
  diag.rsc7GraphicsSize = unpack.graphicsSize;
  diag.decompressMethod = unpack.method;
  diag.decompressedSize = unpack.decompressedSize;
  diag.payloadPeekHex   = unpack.payloadPeekHex;
  diag.failReason       = unpack.failReason ?? '';

  if (!unpack.resource) {
    const reason = unpack.failReason || 'RSC7 decompression failed.';
    diag.errors.push(reason);
    return { drawable: null, reason, diagnostics: diag };
  }

  const res = unpack.resource;
  // Re-dump first 0x100 bytes of the decompressed system segment.
  diag.systemHeaderHex = hexDump(res.buffer, 0, Math.min(0x100, res.buffer.length));

  const r = new ResourceReader(res);

  // ── 1) Locate drawable root ─────────────────────────────────────────────────
  const candidate = findDrawableBase(r, diag);
  if (!candidate) {
    return { drawable: null, reason: diag.errors.join('; ') || 'Drawable not found.', diagnostics: diag };
  }

  const drawableBase = candidate.base;
  diag.drawableHeaderHex = hexDump(res.buffer, drawableBase, Math.min(0xa0, res.buffer.length - drawableBase));

  // ── 2) Shader group ─────────────────────────────────────────────────────────
  const sgPtr = sptr(r, drawableBase + 0x10);
  diag.shaderGroupPtrRaw = `0x${sgPtr.toString(16)}`;
  diag.shaderGroupBase   = r.resolve(sgPtr);

  let shaders: ParsedShader[] = [];
  if (diag.shaderGroupBase >= 0) {
    try { shaders = readShaderGroup(r, sgPtr, diag); }
    catch (e: any) { diag.warnings.push(`ShaderGroup threw: ${e?.message || e}`); }
  } else {
    diag.warnings.push('ShaderGroup ptr unresolved — rendering without textures.');
  }

  // ── 3) DrawableModels — try all LODs in priority order ──────────────────────
  const lodDefs = [
    { off: 0x50, name: 'High' },
    { off: 0x60, name: 'Med'  },
    { off: 0x70, name: 'Low'  },
    { off: 0x80, name: 'VLow' },
  ];

  let modelBases: number[] = [];
  let lodUsedName = '';
  for (const lod of lodDefs) {
    const bases = readPtrArray(r, drawableBase + lod.off, `DrawableModels${lod.name}`, diag);
    if (bases.length > 0) {
      modelBases = bases;
      lodUsedName = lod.name;
      diag.drawableLodUsed = lod.name;
      diag.notes.push(`Using ${lod.name} LOD (${bases.length} models)`);
      break;
    }
  }

  diag.modelsFound = modelBases.length;

  if (modelBases.length === 0) {
    return {
      drawable: null,
      reason: `All LOD levels resolved 0 models from drawable@0x${drawableBase.toString(16)}.`,
      diagnostics: diag,
    };
  }

  // ── 4) Parse geometries ─────────────────────────────────────────────────────
  const geometries: ParsedGeometry[] = [];
  for (let mi = 0; mi < modelBases.length; mi++) {
    try {
      const geos = readDrawableModel(r, modelBases[mi], mi, shaders.length, diag);
      geometries.push(...geos);
    } catch (e: any) {
      diag.errors.push(`Model[${mi}] threw: ${e?.message || e}`);
    }
  }

  if (geometries.length === 0) {
    return {
      drawable: null,
      reason: `${modelBases.length} ${lodUsedName} models decoded but 0 geometries. ` +
              `Errors: ${diag.errors.slice(0, 3).join('; ')}`,
      diagnostics: diag,
    };
  }

  diag.notes.push(
    `OK: ${geometries.length} geom, ${diag.totalVertices} verts, ${diag.totalTriangles} tris, ` +
    `${shaders.length} shaders, LOD=${lodUsedName}, base=0x${drawableBase.toString(16)}, ` +
    `decompressed via ${unpack.method}.`
  );

  const shaderTextureNames = shaders.map((s) => s.textureParams[0] ?? null);

  return {
    drawable: { geometries, shaders, shaderTextureNames, diagnostics: diag },
    diagnostics: diag,
  };
}
