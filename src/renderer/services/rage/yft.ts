// YFT (fragment / drawable) geometry parser for GTA V vehicles.
//
// GTA V .yft = RSC7 container wrapping a fragType struct.
// fragType embeds a crDrawable (pointer at fragType+0x10).
// crDrawable has DrawableModels (high/med/low LOD) and a ShaderGroup.
// Each DrawableModel → array of crGeometry → VertexBuffer + IndexBuffer.
//
// Coordinate system: GTA V is X-right Y-forward Z-up. Caller converts to
// Three.js (X-right Y-up Z-toward-viewer) via: (x, z, -y).

import { unpackRSC7, ResourceReader, type RageResource } from './resource';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface ParsedGeometry {
  name: string;
  positions: Float32Array;     // XYZ triples, GTA V space (caller converts)
  uvs: Float32Array | null;    // UV pairs  (u, v), DX convention (v=0 at top)
  normals: Float32Array | null;
  indices: Uint32Array;
  shaderIndex: number;
  vertexStride: number;
  fvf: number;
}

export interface ParsedShader {
  index: number;
  filename: string;            // e.g. "vehicle_paint1.sps"
  textureParams: string[];     // texture name for each texture parameter slot
}

export interface ParsedDrawable {
  geometries: ParsedGeometry[];
  shaders: ParsedShader[];
  /** Convenience: primary texture name per shader index (first texture param). */
  shaderTextureNames: (string | null)[];
  diagnostics: YftDiagnostics;
}

export interface YftDiagnostics {
  version: number;
  systemSize: number;
  graphicsSize: number;
  decompressedSize: number;
  // Drawable probing
  drawableProbedPtrs: { offset: number; ptrValue: string; resolved: number }[];
  drawableBase: number;
  // Shader group
  shaderGroupPtrRaw: string;
  shaderGroupBase: number;
  shaderCount: number;
  shaders: Array<{ filename: string; textureParams: string[] }>;
  // Geometry
  modelsHighCount: number;
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
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

// ── FVF vertex layout ────────────────────────────────────────────────────────
// GTA V FVF: bit flags in low 16 bits indicate which elements are present.
// Elements appear in this fixed order; higher bits appear later in the vertex.

const FVF_ELEMENTS: { bit: number; size: number; name: string }[] = [
  { bit: 1 << 0,  size: 12, name: 'position'     }, // float3
  { bit: 1 << 1,  size: 16, name: 'blendweights' }, // float4
  { bit: 1 << 2,  size:  4, name: 'blendindices' }, // ubyte4
  { bit: 1 << 3,  size: 12, name: 'normal'       }, // float3
  { bit: 1 << 4,  size:  4, name: 'color0'       }, // D3DCOLOR
  { bit: 1 << 5,  size:  4, name: 'color1'       }, // D3DCOLOR
  { bit: 1 << 6,  size:  4, name: 'texcoord0'    }, // half2
  { bit: 1 << 7,  size:  4, name: 'texcoord1'    }, // half2
  { bit: 1 << 8,  size:  4, name: 'texcoord2'    }, // half2
  { bit: 1 << 9,  size:  4, name: 'texcoord3'    }, // half2
  { bit: 1 << 10, size:  4, name: 'texcoord4'    }, // half2
  { bit: 1 << 11, size:  4, name: 'texcoord5'    }, // half2
  { bit: 1 << 12, size:  4, name: 'texcoord6'    }, // half2
  { bit: 1 << 13, size:  4, name: 'texcoord7'    }, // half2
  { bit: 1 << 14, size: 16, name: 'tangent'      }, // float4
  { bit: 1 << 15, size: 16, name: 'binormal'     }, // float4
];

interface VertexLayout {
  posOff: number;
  normalOff: number;
  uvOff: number;   // -1 = no UV
  uvIsHalf: boolean;
  computedStride: number;
}

function decodeVertexLayout(fvf: number, declaredStride: number): VertexLayout {
  let offset = 0;
  const layout: VertexLayout = { posOff: 0, normalOff: -1, uvOff: -1, uvIsHalf: true, computedStride: 0 };

  for (const el of FVF_ELEMENTS) {
    if (!(fvf & el.bit)) continue;
    switch (el.name) {
      case 'position':  layout.posOff = offset; break;
      case 'normal':    layout.normalOff = offset; break;
      case 'texcoord0': layout.uvOff = offset; layout.uvIsHalf = true; break;
    }
    offset += el.size;
  }
  layout.computedStride = offset;

  // If FVF-derived stride does not match declared stride, use stride heuristic.
  if (offset !== declaredStride && declaredStride >= 12) {
    layout.posOff = 0;
    layout.normalOff = declaredStride >= 24 ? 12 : -1;
    // Most common: UV at stride-4 (half2) or stride-8 (float2).
    if (declaredStride >= 32) {
      layout.uvOff = declaredStride - 4;
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

/** Read a ResourcePointerArray64: returns resolved offset of each pointer. */
function readPtrArray(r: ResourceReader, base: number, tag: string, diag: YftDiagnostics): number[] {
  const arrPtr  = sptr(r, base);
  const count   = su16(r, base + 8);
  if (!arrPtr || count === 0 || count > 2048) return [];
  const arrOff  = r.resolve(arrPtr);
  if (arrOff < 0) {
    diag.warnings.push(`${tag}: array ptr 0x${arrPtr.toString(16)} did not resolve`);
    return [];
  }
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    const p   = sptr(r, arrOff + i * 8);
    const res = r.resolve(p);
    if (res >= 0) results.push(res);
    else diag.warnings.push(`${tag}[${i}]: ptr 0x${p.toString(16)} did not resolve`);
  }
  return results;
}

// ── Hex dump ─────────────────────────────────────────────────────────────────

function hexDump(buf: Uint8Array, off: number, len: number): string {
  const out: string[] = [];
  for (let i = 0; i < len; i += 16) {
    const row: string[] = [];
    for (let j = 0; j < 16 && off + i + j < buf.length; j++)
      row.push(buf[off + i + j].toString(16).padStart(2, '0'));
    out.push(`+0x${i.toString(16).padStart(3, '0')}  ${row.join(' ')}`);
  }
  return out.join('\n');
}

// ── Shader group parser ──────────────────────────────────────────────────────
// grmShaderGroup layout:
//   +0x00: pgBase (16 bytes)
//   +0x10: TextureDictionary ptr (embedded YTD, usually null in YFT)
//   +0x18: Shaders (ResourcePointerArray64<grmShaderFx>)
//
// grmShaderFx layout (approximate for GTA V):
//   +0x00: pgBase (16 bytes)
//   +0x10: parameters data block ptr
//   +0x18: ParameterCount (u8)
//   +0x19: DrawBucket (u8)
//   +0x38: shader filename ptr (string ending in .sps)
//
// To find texture names: scan the shader struct for system-segment ptrs
// that lead to objects with readable ASCII names (those are grcTexture* refs).

function looksLikeTextureName(s: string): boolean {
  return /^[a-zA-Z0-9_]{2,64}$/.test(s) && !/\.(sps|fx|pso|vso)$/.test(s);
}

function readShaderGroup(r: ResourceReader, sgPtr: number, diag: YftDiagnostics): ParsedShader[] {
  const sg = r.resolve(sgPtr);
  if (sg < 0) {
    diag.warnings.push(`ShaderGroup ptr 0x${sgPtr.toString(16)} did not resolve`);
    return [];
  }

  // Shaders array at sg+0x18
  const shaderBases = readPtrArray(r, sg + 0x18, 'ShaderGroup.Shaders', diag);
  diag.shaderCount = shaderBases.length;

  const parsedShaders: ParsedShader[] = [];

  for (let si = 0; si < shaderBases.length; si++) {
    const shBase = shaderBases[si];
    let filename = '';
    const textureParams: string[] = [];

    // Shader filename: probe a few offsets for a string ending in .sps
    for (const filenameOff of [0x38, 0x40, 0x48, 0x30]) {
      const p = sptr(r, shBase + filenameOff);
      const res = r.resolve(p);
      if (res < 0) continue;
      const s = r.str(res, 64);
      if (s.endsWith('.sps') || s.endsWith('.fxc')) { filename = s; break; }
    }

    // Texture parameters: scan shader struct [0x10..0x80] for system-segment
    // pointers that resolve to objects with a readable texture name.
    for (let o = 0x10; o < 0x80; o += 8) {
      const p = sptr(r, shBase + o);
      if (((p >>> 28) & 0xf) !== 0x5) continue; // must be system segment
      const texOff = r.resolve(p);
      if (texOff < 0) continue;
      // A grcTexture has a name pointer at various offsets. Try common ones.
      for (const nameSlot of [0x20, 0x28, 0x18, 0x10]) {
        const np  = sptr(r, texOff + nameSlot);
        const nr  = r.resolve(np);
        if (nr < 0) continue;
        const nm = r.str(nr, 64);
        if (looksLikeTextureName(nm)) {
          if (!textureParams.includes(nm)) textureParams.push(nm);
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
// grcVertexBuffer:
//   +0x00: pgBase (16 bytes)
//   +0x10: VertexCount (u16)
//   +0x12: Locked (u8)
//   +0x13: pad
//   +0x14: Stride (u16)
//   +0x16: pad
//   +0x18: Data ptr (graphics segment)
//   +0x20: VertexDeclaration ptr (system segment)
//
// grcIndexBuffer:
//   +0x00: pgBase (16 bytes)
//   +0x10: IndexCount (u32)
//   +0x14: pad
//   +0x18: Data ptr (graphics segment, u16 array)
//
// grcVertexDeclaration:
//   +0x00: FVF flags (u32 = low 32 bits of the 64-bit FVF value)
//   +0x04: FVF high (u32, type codes — we ignore for now)
//   +0x08: Stride (u8)

interface VBResult { positions: Float32Array; uvs: Float32Array | null; normals: Float32Array | null; stride: number; fvf: number }

function readVertexBuffer(r: ResourceReader, vbBase: number, diag: YftDiagnostics): VBResult | null {
  const vertCount = su16(r, vbBase + 0x10);
  const stride    = su16(r, vbBase + 0x14);
  const vDataPtr  = sptr(r, vbBase + 0x18);
  const vDeclPtr  = sptr(r, vbBase + 0x20);

  if (vertCount === 0 || vertCount > 200_000 || stride < 12 || stride > 256) {
    diag.errors.push(`VB@0x${vbBase.toString(16)}: bad count=${vertCount} stride=${stride}`);
    return null;
  }

  const vDataOff = r.resolve(vDataPtr);
  if (vDataOff < 0) {
    diag.errors.push(`VB@0x${vbBase.toString(16)}: data ptr 0x${vDataPtr.toString(16)} unresolved`);
    return null;
  }

  // Read FVF from vertex declaration
  let fvf = 0;
  const vDeclOff = r.resolve(vDeclPtr);
  if (vDeclOff >= 0) {
    fvf = su32(r, vDeclOff);
    // If FVF low word is 0 but stride looks standard, try a default FVF
    if ((fvf & 0xffff) === 0) fvf = 0;
  }

  const layout = decodeVertexLayout(fvf, stride);
  if (!diag.vertexStrides.includes(stride)) diag.vertexStrides.push(stride);

  const positions = new Float32Array(vertCount * 3);
  const normals   = layout.normalOff >= 0 ? new Float32Array(vertCount * 3) : null;
  const uvs       = layout.uvOff >= 0     ? new Float32Array(vertCount * 2) : null;

  const bufLen = r.res.buffer.length;

  for (let vi = 0; vi < vertCount; vi++) {
    const vo = vDataOff + vi * stride;
    if (vo + stride > bufLen) { diag.warnings.push(`VB: vertex ${vi} out of bounds`); break; }

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
    diag.errors.push(`IB@0x${ibBase.toString(16)}: bad count=${idxCount}`);
    return null;
  }

  const iDataOff = r.resolve(iDataPtr);
  if (iDataOff < 0) {
    diag.errors.push(`IB@0x${ibBase.toString(16)}: data ptr unresolved`);
    return null;
  }

  const bufLen = r.res.buffer.length;
  const indices = new Uint32Array(idxCount);
  for (let ii = 0; ii < idxCount; ii++) {
    const iOff = iDataOff + ii * 2;
    if (iOff + 2 > bufLen) { diag.warnings.push(`IB: index ${ii} out of bounds`); break; }
    indices[ii] = su16(r, iOff);
  }
  return indices;
}

// ── Geometry reader ──────────────────────────────────────────────────────────
// crGeometry:
//   +0x00: pgBase (16 bytes)
//   +0x10: VertexBuffer ptr
//   +0x18: VertexBuffer copy ptr (same buffer, ignore)
//   +0x20: IndexBuffer ptr
//   +0x28: IndexBuffer copy ptr
//   +0x30: IndicesCount (u32)
//   +0x34: TriangleCount (u32)
//   +0x38: VertexCount (u16)
//   +0x3A: PrimitiveType (u16): 3 = triangles

function readGeometry(
  r: ResourceReader, geoBase: number, shaderIndex: number,
  geoIdx: number, diag: YftDiagnostics
): ParsedGeometry | null {
  const vbPtr = sptr(r, geoBase + 0x10);
  const ibPtr = sptr(r, geoBase + 0x20);
  const vbOff = r.resolve(vbPtr);
  const ibOff = r.resolve(ibPtr);

  if (vbOff < 0) { diag.errors.push(`Geo[${geoIdx}]: VB ptr 0x${vbPtr.toString(16)} unresolved`); return null; }
  if (ibOff < 0) { diag.errors.push(`Geo[${geoIdx}]: IB ptr 0x${ibPtr.toString(16)} unresolved`); return null; }

  const vb = readVertexBuffer(r, vbOff, diag);
  if (!vb) return null;

  const indices = readIndexBuffer(r, ibOff, diag);
  if (!indices) return null;

  diag.totalVertices  += vb.positions.length / 3;
  diag.totalTriangles += indices.length / 3;

  return {
    name: `geo_${geoIdx}`,
    positions: vb.positions,
    uvs: vb.uvs,
    normals: vb.normals,
    indices,
    shaderIndex,
    vertexStride: vb.stride,
    fvf: vb.fvf,
  };
}

// ── DrawableModel reader ─────────────────────────────────────────────────────
// crDrawableModel:
//   +0x00: pgBase (16 bytes)
//   +0x10: Geometries (ResourcePointerArray64)
//   +0x18: Geometries.count (u16)
//   +0x20: BoundingBoxMin (Vector4)
//   +0x30: BoundingBoxMax (Vector4)
//   +0x40: BoundingCenter (Vector4)
//   +0x50: ShaderMappings.ptr (ptr to u16[] — one shader index per geometry)
//   +0x58: ShaderMappings.count (u16)

function readDrawableModel(
  r: ResourceReader, modelBase: number, modelIdx: number,
  shaderCount: number, diag: YftDiagnostics
): ParsedGeometry[] {
  // Read geometry pointer array
  const geoBases = readPtrArray(r, modelBase + 0x10, `Model[${modelIdx}].Geometries`, diag);
  if (geoBases.length === 0) {
    diag.warnings.push(`Model[${modelIdx}] at 0x${modelBase.toString(16)}: no geometries resolved`);
    return [];
  }

  // Read shader mappings (one u16 per geometry, giving which shader to use)
  const smPtr     = sptr(r, modelBase + 0x50);
  const smCount   = su16(r, modelBase + 0x58);
  const smOff     = r.resolve(smPtr);
  const shaderMap: number[] = [];
  if (smOff >= 0 && smCount > 0 && smCount <= 512) {
    for (let gi = 0; gi < smCount; gi++) shaderMap.push(su16(r, smOff + gi * 2));
  }

  const geos: ParsedGeometry[] = [];
  for (let gi = 0; gi < geoBases.length; gi++) {
    const shIdx = (gi < shaderMap.length && shaderMap[gi] < Math.max(shaderCount, 1))
      ? shaderMap[gi] : 0;
    const g = readGeometry(r, geoBases[gi], shIdx, diag.geometryCount + gi, diag);
    if (g) geos.push(g);
  }
  diag.geometryCount += geos.length;
  return geos;
}

// ── Drawable base probe ──────────────────────────────────────────────────────
// .yft: fragType at system 0x00. fragType.Drawable is a POINTER at fragType+0x10.
// .ydr: crDrawable directly at system 0x00.
// We probe both and accept the one where DrawableModelsHigh resolves.

function findDrawableBase(r: ResourceReader, diag: YftDiagnostics): number {
  const probes: Array<{ desc: string; getBase: () => number }> = [
    {
      desc: 'fragType.Drawable ptr at 0x10',
      getBase: () => r.resolve(sptr(r, 0x10)),
    },
    {
      desc: 'direct drawable at 0x00 (ydr-style)',
      getBase: () => 0,
    },
    {
      desc: 'embedded drawable at 0x10 (fragType pgBase=16)',
      getBase: () => 0x10,
    },
  ];

  for (const p of probes) {
    let base: number;
    try { base = p.getBase(); } catch { continue; }
    if (base < 0) continue;

    const modelsPtr = sptr(r, base + 0x50);
    const modelsOff = r.resolve(modelsPtr);
    const modelsCount = su16(r, base + 0x58);

    diag.drawableProbedPtrs.push({
      offset: base + 0x50,
      ptrValue: `0x${modelsPtr.toString(16)}`,
      resolved: modelsOff,
    });

    if (modelsOff >= 0 && modelsCount > 0 && modelsCount <= 256) {
      diag.notes.push(`Drawable base: ${p.desc} → system:0x${base.toString(16)} (${modelsCount} high-LOD models)`);
      return base;
    }
  }

  diag.errors.push('Could not locate drawable root. Tried fragType ptr@0x10, direct@0x00, embedded@0x10.');
  return -1;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function parseYftGeometry(buffer: ArrayBuffer): Promise<YftParseResult> {
  const diag: YftDiagnostics = {
    version: 0, systemSize: 0, graphicsSize: 0, decompressedSize: 0,
    drawableProbedPtrs: [], drawableBase: -1,
    shaderGroupPtrRaw: '', shaderGroupBase: -1, shaderCount: 0, shaders: [],
    modelsHighCount: 0, geometryCount: 0, totalVertices: 0, totalTriangles: 0,
    vertexStrides: [], systemHeaderHex: '', drawableHeaderHex: '',
    errors: [], warnings: [], notes: [],
  };

  const bytes = new Uint8Array(buffer);
  const res = await unpackRSC7(bytes);
  if (!res) {
    return { drawable: null, reason: 'Not a valid RSC7 resource or decompression failed.', diagnostics: diag };
  }

  diag.version          = res.version;
  diag.systemSize       = res.systemSize;
  diag.graphicsSize     = res.graphicsSize;
  diag.decompressedSize = res.buffer.length;
  diag.systemHeaderHex  = hexDump(res.buffer, 0, Math.min(0x60, res.buffer.length));

  const r = new ResourceReader(res);

  // 1) Locate drawable root
  const drawableBase = findDrawableBase(r, diag);
  diag.drawableBase = drawableBase;
  if (drawableBase < 0) {
    return { drawable: null, reason: diag.errors.join('; ') || 'Drawable not found.', diagnostics: diag };
  }
  diag.drawableHeaderHex = hexDump(res.buffer, drawableBase, Math.min(0xa0, res.buffer.length - drawableBase));

  // 2) Shader group
  const sgPtr = sptr(r, drawableBase + 0x10);
  diag.shaderGroupPtrRaw = `0x${sgPtr.toString(16)}`;
  diag.shaderGroupBase   = r.resolve(sgPtr);
  let shaders: ParsedShader[] = [];
  if (diag.shaderGroupBase >= 0) {
    try { shaders = readShaderGroup(r, sgPtr, diag); }
    catch (e: any) { diag.warnings.push(`ShaderGroup parse threw: ${e?.message || e}`); }
  } else {
    diag.warnings.push('ShaderGroup pointer did not resolve — geometry will render without textures.');
  }

  // 3) DrawableModelsHigh (LOD0 — best quality, what users see up close)
  const modelBases = readPtrArray(r, drawableBase + 0x50, 'DrawableModelsHigh', diag);
  diag.modelsHighCount = modelBases.length;
  if (modelBases.length === 0) {
    return {
      drawable: null,
      reason: `DrawableModelsHigh resolved 0 models from drawable@0x${drawableBase.toString(16)}.`,
      diagnostics: diag,
    };
  }

  // 4) Geometries from each model
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
      reason: `Found ${modelBases.length} models but 0 geometries decoded. Errors: ${diag.errors.slice(0, 3).join('; ')}`,
      diagnostics: diag,
    };
  }

  diag.notes.push(`Decoded ${geometries.length} geometries, ${diag.totalVertices} verts, ${diag.totalTriangles} tris.`);

  const shaderTextureNames = shaders.map((s) => s.textureParams[0] ?? null);

  return {
    drawable: { geometries, shaders, shaderTextureNames, diagnostics: diag },
    diagnostics: diag,
  };
}
