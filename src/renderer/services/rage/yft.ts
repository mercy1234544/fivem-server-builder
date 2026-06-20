// YFT (fragment / drawable) geometry parser for GTA V vehicles.
//
// IMPORTANT — these .yft files use a self-describing TAGGED container format
// (as produced by the OutputDump/MGiturm pipeline and openable in OpenIV), not
// the raw RAGE crDrawable pointer hierarchy. After RSC7 decompression the
// buffer is laid out as a tree of 4-byte ASCII-tagged structures:
//
//   FRAG  root fragment
//   MATS  material table          (→ array of material structs)
//   TXEX  texture reference        (texture name string @ +0x28)
//   SKEL  skeleton
//   DRFR  drawable fragment        (→ MATS, SKEL, GEOM groups, bounds)
//   GEOM  geometry group / LOD     (→ array of MESH pointers @ +0x40)
//   MESH  one mesh                 (VBUF ptr @ +0x18, IBUF ptr @ +0x38)
//   VBUF  vertex buffer            (stride @ +0x08, dataPtr @ +0x10,
//                                   vertexCount @ +0x18, declPtr @ +0x30)
//   IBUF  index buffer             (indexCount @ +0x08, dataPtr @ +0x10)
//
// Vertex layout (per VBUF):
//   position : float3  @ offset 0          (always)
//   uv0      : half2   @ offset ~0x0C       (detected per-mesh)
//   normal   : float3  @ offset ~0x14       (detected per-mesh)
//
// Pointers are 32-bit segmented (top nibble 0x5 = system). These dump files put
// everything in one "system" segment so resolve() is offset = ptr & 0x0FFFFFFF.

import { unpackRSC7Detailed, ResourceReader } from './resource';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface ParsedGeometry {
  name: string;
  /** RAW GTA-space positions (x,y,z). buildVehicleFromDrawable applies the
   *  GTA→Three transform — do NOT pre-transform here. */
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
  // Container format
  containerFormat: string;     // 'tagged' | 'unknown'
  tagCounts: Record<string, number>;
  // Buffer scan
  sysPtrCount: number;
  gfxPtrCount: number;
  maxSysPtrOff: number;
  maxGfxPtrOff: number;
  sysSizeUsed: number;
  sysSizeSource: string;
  // Probe results (kept for UI compatibility)
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
  meshTagCount: number;
  geometryCount: number;
  totalVertices: number;
  totalTriangles: number;
  vertexStrides: number[];
  boundingBox: string;
  textureNames: string[];
  // Hex dumps
  bufferHex: string;
  drawableHeaderHex: string;
  // Investigation log
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

// ── Safe-read helpers ────────────────────────────────────────────────────────

function su8(r: ResourceReader, o: number)  { return (o >= 0 && o + 1 <= r.res.buffer.length) ? r.u8(o) : 0; }
function su16(r: ResourceReader, o: number) { return (o >= 0 && o + 2 <= r.res.buffer.length) ? r.u16(o) : 0; }
function su32(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.u32(o) : 0; }
function sf32(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.f32(o) : 0; }
function sptr(r: ResourceReader, o: number) { return (o >= 0 && o + 4 <= r.res.buffer.length) ? r.ptr(o) : 0; }

function tagAt(r: ResourceReader, o: number): string {
  if (o < 0 || o + 4 > r.res.buffer.length) return '';
  return String.fromCharCode(su8(r, o), su8(r, o + 1), su8(r, o + 2), su8(r, o + 3));
}

function readCString(r: ResourceReader, o: number, max = 96): string {
  if (o < 0) return '';
  let s = '';
  for (let i = 0; i < max; i++) {
    const c = su8(r, o + i);
    if (c === 0) break;
    if (c < 32 || c > 126) return s; // stop at non-printable
    s += String.fromCharCode(c);
  }
  return s;
}

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

// ── Tag enumeration ──────────────────────────────────────────────────────────

function findTagOffsets(buf: Uint8Array, tag: string): number[] {
  const a = tag.charCodeAt(0), b = tag.charCodeAt(1), c = tag.charCodeAt(2), d = tag.charCodeAt(3);
  const out: number[] = [];
  for (let i = 0; i + 4 <= buf.length; i += 4)
    if (buf[i] === a && buf[i + 1] === b && buf[i + 2] === c && buf[i + 3] === d) out.push(i);
  return out;
}

function censusTags(buf: Uint8Array): Record<string, number> {
  const counts: Record<string, number> = {};
  const isAZ = (c: number) => c >= 0x41 && c <= 0x5a;
  for (let i = 0; i + 4 <= buf.length; i += 4) {
    if (isAZ(buf[i]) && isAZ(buf[i + 1]) && isAZ(buf[i + 2]) && isAZ(buf[i + 3])) {
      const t = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

// ── Vertex layout discovery (empirical) ───────────────────────────────────────
// Different meshes pack UV / normal at different offsets. Probe the stride for
// the slot that yields the most normalized UVs (half2 in ~[0,1]) and the most
// unit-length float3 normals.

interface VLayout { uvOff: number; uvIsHalf: boolean; normalOff: number; }

function discoverVertexLayout(r: ResourceReader, dataOff: number, count: number, stride: number): VLayout {
  const N = Math.min(count, 256);
  let bestUv = -1, bestUvScore = 0, bestUvHalf = true;
  let bestNrm = -1, bestNrmScore = 0;

  // UV as half2
  for (let off = 8; off + 4 <= stride; off += 2) {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      const o = dataOff + i * stride + off;
      const u = decodeHalf(su16(r, o)), v = decodeHalf(su16(r, o + 2));
      if (u >= -0.25 && u <= 1.25 && v >= -0.25 && v <= 1.25 && (u !== 0 || v !== 0)) ok++;
    }
    if (ok > bestUvScore) { bestUvScore = ok; bestUv = off; bestUvHalf = true; }
  }
  // UV as float2 (fallback) — only if half2 was weak
  if (bestUvScore < N * 0.5) {
    for (let off = 12; off + 8 <= stride; off += 4) {
      let ok = 0;
      for (let i = 0; i < N; i++) {
        const o = dataOff + i * stride + off;
        const u = sf32(r, o), v = sf32(r, o + 4);
        if (u >= -0.25 && u <= 1.25 && v >= -0.25 && v <= 1.25 && (u !== 0 || v !== 0)) ok++;
      }
      if (ok > bestUvScore) { bestUvScore = ok; bestUv = off; bestUvHalf = false; }
    }
  }
  // normal as float3 unit vector
  for (let off = 12; off + 12 <= stride; off += 4) {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      const o = dataOff + i * stride + off;
      const x = sf32(r, o), y = sf32(r, o + 4), z = sf32(r, o + 8);
      const m = Math.sqrt(x * x + y * y + z * z);
      if (m > 0.85 && m < 1.15) ok++;
    }
    if (ok > bestNrmScore) { bestNrmScore = ok; bestNrm = off; }
  }

  return {
    uvOff: bestUvScore > N * 0.5 ? bestUv : -1,
    uvIsHalf: bestUvHalf,
    normalOff: bestNrmScore > N * 0.5 ? bestNrm : -1,
  };
}

// ── VBUF / IBUF / MESH parsing ─────────────────────────────────────────────────

interface VBuf { stride: number; count: number; dataOff: number; declOff: number; }
interface IBuf { count: number; dataOff: number; }

function parseVBuf(r: ResourceReader, vbOff: number): VBuf | null {
  if (tagAt(r, vbOff) !== 'VBUF') return null;
  const stride = su32(r, vbOff + 0x08);
  const dataOff = r.resolve(sptr(r, vbOff + 0x10));
  const count = su32(r, vbOff + 0x18);
  const declOff = r.resolve(sptr(r, vbOff + 0x30));
  if (stride < 12 || stride > 256 || count === 0 || count > 1_000_000) return null;
  if (dataOff < 0 || dataOff + count * stride > r.res.buffer.length) return null;
  return { stride, count, dataOff, declOff };
}

function parseIBuf(r: ResourceReader, ibOff: number): IBuf | null {
  if (tagAt(r, ibOff) !== 'IBUF') return null;
  const count = su32(r, ibOff + 0x08);
  const dataOff = r.resolve(sptr(r, ibOff + 0x10));
  if (count === 0 || count > 20_000_000) return null;
  if (dataOff < 0 || dataOff + count * 2 > r.res.buffer.length) return null;
  return { count, dataOff };
}

function buildGeometry(
  r: ResourceReader, meshOff: number, geoIdx: number,
  shaderIndex: number, diag: YftDiagnostics,
): ParsedGeometry | null {
  const vbOff = r.resolve(sptr(r, meshOff + 0x18));
  const ibOff = r.resolve(sptr(r, meshOff + 0x38));
  if (vbOff < 0 || ibOff < 0) return null;

  const vb = parseVBuf(r, vbOff);
  const ib = parseIBuf(r, ibOff);
  if (!vb || !ib) {
    diag.warnings.push(`MESH@0x${meshOff.toString(16)}: VBUF/IBUF invalid`);
    return null;
  }

  if (!diag.vertexStrides.includes(vb.stride)) diag.vertexStrides.push(vb.stride);

  const layout = discoverVertexLayout(r, vb.dataOff, vb.count, vb.stride);

  const positions = new Float32Array(vb.count * 3);
  const normals = layout.normalOff >= 0 ? new Float32Array(vb.count * 3) : null;
  const uvs = layout.uvOff >= 0 ? new Float32Array(vb.count * 2) : null;

  for (let i = 0; i < vb.count; i++) {
    const vo = vb.dataOff + i * vb.stride;
    // RAW position (transform applied downstream in buildVehicleFromDrawable)
    positions[i * 3]     = sf32(r, vo);
    positions[i * 3 + 1] = sf32(r, vo + 4);
    positions[i * 3 + 2] = sf32(r, vo + 8);

    if (normals && layout.normalOff >= 0) {
      normals[i * 3]     = sf32(r, vo + layout.normalOff);
      normals[i * 3 + 1] = sf32(r, vo + layout.normalOff + 4);
      normals[i * 3 + 2] = sf32(r, vo + layout.normalOff + 8);
    }

    if (uvs && layout.uvOff >= 0) {
      if (layout.uvIsHalf) {
        uvs[i * 2]     = decodeHalf(su16(r, vo + layout.uvOff));
        uvs[i * 2 + 1] = decodeHalf(su16(r, vo + layout.uvOff + 2));
      } else {
        uvs[i * 2]     = sf32(r, vo + layout.uvOff);
        uvs[i * 2 + 1] = sf32(r, vo + layout.uvOff + 4);
      }
    }
  }

  const triCount = Math.floor(ib.count / 3);
  const indices = new Uint32Array(ib.count);
  let maxIdx = 0;
  for (let i = 0; i < ib.count; i++) {
    const v = su16(r, ib.dataOff + i * 2);
    indices[i] = v;
    if (v > maxIdx) maxIdx = v;
  }
  // Guard: index out of vertex range → drop mesh
  if (maxIdx >= vb.count) {
    diag.warnings.push(`MESH@0x${meshOff.toString(16)}: index ${maxIdx} >= vertCount ${vb.count}`);
    return null;
  }

  diag.totalVertices += vb.count;
  diag.totalTriangles += triCount;

  return {
    name: `mesh_${geoIdx}`,
    positions, uvs, normals, indices,
    shaderIndex, vertexStride: vb.stride, fvf: 0,
  };
}

// ── GEOM (LOD group) parsing ───────────────────────────────────────────────────
// Each GEOM holds an array of MESH pointers (from +0x40) and a count (u16 @+0x10).
// The 7 GEOMs of a vehicle are LOD levels + wheels; GEOM[0] is the high LOD.

function geomMeshOffsets(r: ResourceReader, geomOff: number): number[] {
  const count = su16(r, geomOff + 0x10);
  if (count === 0 || count > 4096) return [];
  const out: number[] = [];
  // Tolerate a few non-MESH slots (padding) while collecting `count` meshes.
  for (let i = 0; i < count * 2 + 8 && out.length < count; i++) {
    const p = r.resolve(sptr(r, geomOff + 0x40 + i * 8));
    if (p >= 0 && tagAt(r, p) === 'MESH') out.push(p);
  }
  return out;
}

function meshVertCount(r: ResourceReader, meshOff: number): number {
  const vb = r.resolve(sptr(r, meshOff + 0x18));
  if (vb < 0 || tagAt(r, vb) !== 'VBUF') return 0;
  return su32(r, vb + 0x18);
}

// ── Texture references (TXEX) ──────────────────────────────────────────────────

function collectTextureNames(r: ResourceReader): string[] {
  const buf = r.res.buffer;
  const txexOffs = findTagOffsets(buf, 'TXEX');
  const names: string[] = [];
  const seen = new Set<string>();
  for (const t of txexOffs) {
    const nameOff = r.resolve(sptr(r, t + 0x28));
    if (nameOff < 0) continue;
    const nm = readCString(r, nameOff, 96);
    if (nm.length >= 2 && /^[a-zA-Z0-9_]+$/.test(nm) && !seen.has(nm)) {
      seen.add(nm);
      names.push(nm);
    }
  }
  return names;
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
    containerFormat: 'unknown', tagCounts: {},
    sysPtrCount: 0, gfxPtrCount: 0, maxSysPtrOff: 0, maxGfxPtrOff: 0,
    sysSizeUsed: 0, sysSizeSource: '',
    probeResults: [], drawableBase: -1, drawableLodUsed: '',
    shaderGroupPtrRaw: '', shaderGroupBase: -1, shaderCount: 0, shaders: [],
    modelsFound: 0, meshTagCount: 0, geometryCount: 0,
    totalVertices: 0, totalTriangles: 0,
    vertexStrides: [], boundingBox: '', textureNames: [],
    bufferHex: '', drawableHeaderHex: '',
    investigationLog: [],
    systemHeaderHex: '',
    errors: [], warnings: [], notes: [],
  };

  const log = diag.investigationLog;
  const bytes = new Uint8Array(buffer);

  diag.rsc7Magic = bytes.length >= 4 &&
    bytes[0] === 0x52 && bytes[1] === 0x53 && bytes[2] === 0x43 && bytes[3] === 0x37;

  log.push(`=== YFT INVESTIGATION (tagged-format parser) ===`);
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
  log.push(`Result: method=${unpack.method}, size=${unpack.decompressedSize}`);

  if (!unpack.resource) {
    const reason = unpack.failReason || 'RSC7 decompression failed.';
    diag.errors.push(reason);
    log.push(`FATAL: ${reason}`);
    return { drawable: null, reason, diagnostics: diag };
  }

  const res = unpack.resource;
  const buf = res.buffer;
  const r = new ResourceReader(res);
  diag.sysSizeUsed = r.sysSize;
  diag.sysSizeSource = res.systemSize > 0 && res.systemSize < buf.length ? 'RSC7 flags' : 'whole buffer';
  diag.bufferHex = hexDump(buf, 0, Math.min(0x100, buf.length));
  diag.systemHeaderHex = diag.bufferHex;
  diag.drawableHeaderHex = hexDump(buf, 0, Math.min(0xa0, buf.length));

  // Lightweight pointer census (keeps the diagnostics panel honest).
  {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let sys = 0, gfx = 0, maxSys = 0, maxGfx = 0;
    const limit = buf.length - 3;
    for (let i = 0; i < limit; i += 4) {
      const v = dv.getUint32(i, true);
      const seg = (v >>> 28) & 0xf, off = v & 0x0fffffff;
      if (seg === 5) { sys++; if (off > maxSys) maxSys = off; }
      else if (seg === 6) { gfx++; if (off > maxGfx) maxGfx = off; }
    }
    diag.sysPtrCount = sys; diag.gfxPtrCount = gfx;
    diag.maxSysPtrOff = maxSys; diag.maxGfxPtrOff = maxGfx;
  }

  log.push(`\n=== BUFFER FIRST 0x40 BYTES ===`);
  log.push(hexDump(buf, 0, Math.min(0x40, buf.length)));

  // ── Tag census ──────────────────────────────────────────────────────────────
  diag.tagCounts = censusTags(buf);
  const meshOffs = findTagOffsets(buf, 'MESH');
  diag.meshTagCount = meshOffs.length;
  log.push(`\n=== TAG CENSUS ===`);
  log.push(`MESH=${diag.tagCounts['MESH'] || 0} VBUF=${diag.tagCounts['VBUF'] || 0} IBUF=${diag.tagCounts['IBUF'] || 0} ` +
           `GEOM=${diag.tagCounts['GEOM'] || 0} DRFR=${diag.tagCounts['DRFR'] || 0} TXEX=${diag.tagCounts['TXEX'] || 0} MATS=${diag.tagCounts['MATS'] || 0}`);

  if (meshOffs.length === 0) {
    const reason = 'No MESH tags found — file is not in the expected tagged YFT format.';
    diag.errors.push(reason);
    log.push(`FATAL: ${reason}`);
    return { drawable: null, reason, diagnostics: diag };
  }
  diag.containerFormat = 'tagged';
  diag.modelsFound = meshOffs.length;
  diag.drawableBase = 0;            // FRAG root is the drawable in this format
  diag.drawableLodUsed = 'tagged';

  // ── Texture names (TXEX) → shaders ──────────────────────────────────────────
  const textureNames = collectTextureNames(r);
  diag.textureNames = textureNames;
  log.push(`\n=== TEXTURES ===`);
  log.push(`TXEX texture names: ${textureNames.length}`);
  log.push(textureNames.slice(0, 40).join(', '));

  // Shader 0 is a neutral paint material (no texture) so the very first render
  // shows a clean, correctly-shaded vehicle rather than one decal texture smeared
  // across every part. The real TXEX texture names follow at indices 1..N so the
  // editor still has the full texture list to bind per-part in a later pass.
  const shaders: ParsedShader[] = [
    { index: 0, filename: 'vehicle_paint', textureParams: [] },
    ...textureNames.map((nm, i) => ({ index: i + 1, filename: nm, textureParams: [nm] })),
  ];
  diag.shaderCount = shaders.length;
  diag.shaders = shaders.map((s) => ({ filename: s.filename, textureParams: s.textureParams }));

  // All meshes use the neutral paint slot for now (mesh→material mapping is the
  // next milestone). This guarantees a clean render with Materials > 0.
  const bodyIdx = 0;

  // ── Select the high-LOD GEOM (avoids rendering overlapping LOD copies) ───────
  log.push(`\n=== GEOM / LOD SELECTION ===`);
  const geomOffs = findTagOffsets(buf, 'GEOM');
  let renderMeshes: number[] = [];
  let bestVerts = 0, bestGeom = -1;
  for (let gi = 0; gi < geomOffs.length; gi++) {
    const ms = geomMeshOffsets(r, geomOffs[gi]);
    let v = 0; for (const m of ms) v += meshVertCount(r, m);
    log.push(`  GEOM[${gi}] meshes=${ms.length} verts=${v}`);
    if (v > bestVerts) { bestVerts = v; bestGeom = gi; renderMeshes = ms; }
  }
  if (renderMeshes.length === 0) {
    log.push(`  No GEOM yielded meshes — falling back to all ${meshOffs.length} MESH tags.`);
    renderMeshes = meshOffs;
  } else {
    log.push(`  Selected GEOM[${bestGeom}] (high LOD): ${renderMeshes.length} of ${meshOffs.length} meshes.`);
  }
  diag.modelsFound = renderMeshes.length;

  // ── Build geometries from the selected meshes ────────────────────────────────
  log.push(`\n=== GEOMETRY ===`);
  log.push(`Building ${renderMeshes.length} meshes...`);
  const geometries: ParsedGeometry[] = [];
  for (let i = 0; i < renderMeshes.length; i++) {
    try {
      const g = buildGeometry(r, renderMeshes[i], i, bodyIdx, diag);
      if (g) geometries.push(g);
    } catch (e: any) {
      diag.warnings.push(`MESH[${i}] threw: ${e?.message || e}`);
    }
  }
  diag.geometryCount = geometries.length;

  // ── Bounding box ────────────────────────────────────────────────────────────
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const g of geometries) {
    for (let i = 0; i < g.positions.length; i += 3) {
      const x = g.positions[i], y = g.positions[i + 1], z = g.positions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  if (geometries.length > 0) {
    diag.boundingBox = `${(maxX - minX).toFixed(2)} x ${(maxY - minY).toFixed(2)} x ${(maxZ - minZ).toFixed(2)} m`;
  }

  log.push(`Geometries built: ${geometries.length} / ${meshOffs.length}`);
  log.push(`Total vertices: ${diag.totalVertices}`);
  log.push(`Total triangles: ${diag.totalTriangles}`);
  log.push(`Bounding box: ${diag.boundingBox}`);
  log.push(`Vertex strides seen: ${diag.vertexStrides.join(', ')}`);

  if (geometries.length === 0) {
    const reason = `${meshOffs.length} MESH tags found but 0 geometries decoded. ${diag.warnings.slice(0, 3).join('; ')}`;
    diag.errors.push(reason);
    return { drawable: null, reason, diagnostics: diag };
  }

  diag.notes.push(
    `OK: ${geometries.length} meshes, ${diag.totalVertices} verts, ${diag.totalTriangles} tris, ` +
    `${shaders.length} shaders/textures, bbox=${diag.boundingBox}, decompress=${unpack.method}.`
  );

  return {
    drawable: {
      geometries, shaders,
      shaderTextureNames: shaders.map((s) => s.textureParams[0] ?? null),
      diagnostics: diag,
    },
    diagnostics: diag,
  };
}
