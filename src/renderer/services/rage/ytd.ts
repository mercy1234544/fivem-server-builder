// YTD (texture dictionary) parser built on the RAGE resource core.
//
// Reads real grcTexturePC entries out of a genuine GTA .ytd and decodes them to RGBA.
// The texture struct is located SELF-DESCRIPTIVELY: we scan each entry for the
// distinctive format code (DXT1/DXT5/BC7…) and derive Width/Height from the fixed
// grcTexturePC field order (Width, Height, Depth, Stride, Format are contiguous, so
// Width = Format-8). This avoids brittle hard-coded offsets that produced impossible
// dimensions. Full diagnostics + raw hex are recorded for every step.

import { unpackRSC7, ResourceReader, isRSC7 } from './resource';
import { decodeRawTexture, extractTexturesFromYTD, ddsToImageData } from '../ytdParser';

export interface TextureRecord {
  index: number;
  name: string;
  width: number;
  height: number;
  formatCode: number;
  format: string | null;
  levels: number;
  dataOffset: number;
  bytesNeeded: number;
  bytesAvailable: number;
  decoded: boolean;
  editable: boolean;
  livery: boolean;
  reason: string;
  // diagnostics
  texOffset?: number;       // resolved struct offset in the decompressed buffer
  formatFieldOffset?: number; // offset of Format within the struct (relative)
  rawHex?: string;          // hex dump of the struct header (first ~0x70 bytes)
  imageData?: ImageData;
}

export interface YtdReport {
  isRSC7: boolean;
  inflated: boolean;
  version?: number;
  systemSize?: number;
  graphicsSize?: number;
  decompressedSize?: number;
  method: 'dictionary' | 'embedded-dds' | 'none';
  declaredCount: number;
  entriesResolved: boolean;
  entriesOffset?: number;
  dictHeaderHex?: string;
  textures: TextureRecord[];
  notes: string[];
}

export interface VehicleTexture {
  name: string;
  width: number;
  height: number;
  format: string;
  imageData: ImageData;
}

// Distinctive fourCC-style format codes — used to *locate* the Format field.
const FORMAT_NAMES = new Map<number, string>([
  [0x31545844, 'DXT1'], [0x33545844, 'DXT3'], [0x35545844, 'DXT5'],
  [0x31495441, 'ATI1'], [0x32495441, 'ATI2'],
  [0x55344342, 'BC4U'], [0x55354342, 'BC5U'], [0x20374342, 'BC7'],
]);
// Uncompressed format enum values (checked only at the located offset).
const UNCOMPRESSED = new Map<number, string>([[21, 'A8R8G8B8'], [32, 'A8B8G8R8']]);

// Map a format name to our decoder, or null if not yet decodable.
function decoderFor(fmt: string): 'DXT1' | 'DXT3' | 'DXT5' | 'BGRA8' | 'RGBA8' | null {
  switch (fmt) {
    case 'DXT1': return 'DXT1';
    case 'DXT3': return 'DXT3';
    case 'DXT5': return 'DXT5';
    case 'A8R8G8B8': return 'BGRA8';
    case 'A8B8G8R8': return 'RGBA8';
    default: return null; // BC7/ATI1/ATI2 — metadata only for now
  }
}

function topMipBytes(fmt: string, w: number, h: number): number {
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  if (fmt === 'DXT1') return bw * bh * 8;
  if (fmt === 'DXT3' || fmt === 'DXT5' || fmt === 'BC7' || fmt === 'ATI2' || fmt === 'BC5U') return bw * bh * 16;
  if (fmt === 'ATI1' || fmt === 'BC4U') return bw * bh * 8;
  return w * h * 4;
}

const LIVERY_RE = /sign|livery|liv\d|_l\d|lvl|decal|skin|paint|template|markings?/i;
function classifyLivery(name: string, w: number, h: number): boolean {
  return LIVERY_RE.test(name) || (w >= 1024 && h >= 1024);
}

function hexDump(buf: Uint8Array, off: number, len: number): string {
  const out: string[] = [];
  for (let i = 0; i < len; i += 16) {
    const row: string[] = [];
    for (let j = 0; j < 16 && off + i + j < buf.length; j++) {
      row.push(buf[off + i + j].toString(16).padStart(2, '0'));
    }
    out.push(`+0x${i.toString(16).padStart(2, '0')}  ${row.join(' ')}`);
  }
  return out.join('\n');
}

function looksLikeName(r: ResourceReader, off: number): boolean {
  if (off < 0) return false;
  const c0 = r.u8(off);
  // GTA texture names start with a printable ASCII letter/digit/underscore.
  return (c0 >= 0x30 && c0 <= 0x7a) && r.str(off, 4).length >= 2;
}

/** Locate and read a single grcTexturePC by scanning for its format field. */
function parseTexture(r: ResourceReader, t: number, bufLen: number): {
  ok: boolean; name: string; width: number; height: number; formatCode: number;
  format: string | null; levels: number; dataOff: number; formatFieldOffset: number; reason: string;
} {
  // 1) Find the Format field (distinctive fourCC) within the struct window.
  let formatFieldOffset = -1, formatCode = 0, format: string | null = null;
  for (let o = 0x28; o <= 0x68; o += 4) {
    const v = r.u32(t + o) >>> 0;
    if (FORMAT_NAMES.has(v)) { formatFieldOffset = o; formatCode = v; format = FORMAT_NAMES.get(v)!; break; }
    if (UNCOMPRESSED.has(v)) {
      // Only accept an uncompressed code if the preceding dims look sane.
      const w = r.u16(t + o - 8), h = r.u16(t + o - 6);
      if (w >= 4 && w <= 8192 && h >= 4 && h <= 8192) { formatFieldOffset = o; formatCode = v; format = UNCOMPRESSED.get(v)!; break; }
    }
  }
  if (formatFieldOffset < 0) {
    return { ok: false, name: '', width: 0, height: 0, formatCode: 0, format: null, levels: 0, dataOff: -1, formatFieldOffset: -1, reason: 'Could not locate a known format code in the struct (entry may not be a texture, or count is too high)' };
  }

  // 2) Width/Height precede Format: Width(2) Height(2) Depth(2) Stride(2) Format(4).
  const width = r.u16(t + formatFieldOffset - 8);
  const height = r.u16(t + formatFieldOffset - 6);
  const levels = r.u8(t + formatFieldOffset + 5);
  if (width < 1 || height < 1 || width > 16384 || height > 16384) {
    return { ok: false, name: '', width, height, formatCode, format, levels, dataOff: -1, formatFieldOffset, reason: `Format ${format} located at +0x${formatFieldOffset.toString(16)} but derived dimensions ${width}×${height} are invalid` };
  }

  // 3) Name pointer — try the usual slots, accept the one resolving to ASCII.
  let name = `texture_${(t >>> 4) & 0xffff}`;
  for (const no of [0x20, 0x28, 0x18, 0x10]) {
    const p = r.resolve(r.ptr(t + no));
    if (looksLikeName(r, p)) { name = r.str(p, 64); break; }
  }

  // 4) Data pointer — the grcTexturePC pixel pointer sits a little AFTER the format
  //    block. Scan a wide 8-aligned window for graphics-segment pointers and pick the
  //    one that can actually hold the top mip.
  const need = topMipBytes(format!, width, height);
  const cands: { off: number; avail: number }[] = [];
  for (let o = 0x10; o + 8 <= 0xa0; o += 8) {
    const p = r.ptr(t + o);
    if (((p >>> 28) & 0xf) === 0x6) {
      const ro = r.resolve(p);
      if (ro >= 0 && ro < bufLen) cands.push({ off: ro, avail: bufLen - ro });
    }
  }
  const fitting = cands.filter((c) => c.avail >= need).sort((a, b) => a.avail - b.avail);
  const dataOff = fitting.length ? fitting[0].off : (cands.length ? cands.sort((a, b) => b.avail - a.avail)[0].off : -1);

  return { ok: true, name, width, height, formatCode, format, levels, dataOff, formatFieldOffset, reason: '' };
}

/** Parse a YTD with full diagnostics. Never throws; records every decision. */
export async function parseYtdDetailed(buffer: ArrayBuffer): Promise<YtdReport> {
  const bytes = new Uint8Array(buffer);
  const report: YtdReport = {
    isRSC7: isRSC7(bytes), inflated: false, method: 'none',
    declaredCount: 0, entriesResolved: false, textures: [], notes: [],
  };

  if (report.isRSC7) {
    const res = await unpackRSC7(bytes);
    if (!res) {
      report.notes.push('RSC7 header present but deflate decompression failed (DecompressionStream unavailable or corrupt payload).');
    } else {
      report.inflated = true;
      report.version = res.version;
      report.systemSize = res.systemSize;
      report.graphicsSize = res.graphicsSize;
      report.decompressedSize = res.buffer.length;
      report.dictHeaderHex = hexDump(res.buffer, 0, 0x40);
      try { parseDictionary(res, report); }
      catch (e: any) { report.notes.push(`Dictionary parse threw: ${e?.message || e}`); }
    }
  } else {
    report.notes.push('File does not start with the RSC7 magic. It may be an uncompressed or non-standard YTD.');
  }

  const decodedFromDict = report.textures.filter((t) => t.decoded).length;

  if (decodedFromDict === 0) {
    try {
      const embedded = await extractTexturesFromYTD(buffer);
      if (embedded.length > 0) {
        report.method = 'embedded-dds';
        report.notes.push(`Dictionary yielded no decodable textures — fell back to embedded-DDS scan (${embedded.length} found).`);
        embedded.forEach((t) => {
          const id = ddsToImageData(t.ddsBytes);
          report.textures.push({
            index: report.textures.length, name: t.name, width: t.width, height: t.height,
            formatCode: 0, format: t.format, levels: 1, dataOffset: -1,
            bytesNeeded: 0, bytesAvailable: t.ddsBytes.length, decoded: !!id, editable: !!id,
            livery: classifyLivery(t.name, t.width, t.height),
            reason: id ? `Decoded embedded DDS (${t.format} ${t.width}×${t.height})` : 'Embedded DDS failed to decode',
            imageData: id || undefined,
          });
        });
      } else if (report.textures.length === 0) {
        report.notes.push('Embedded-DDS scan also found nothing.');
      }
    } catch (e: any) {
      report.notes.push(`Embedded-DDS scan threw: ${e?.message || e}`);
    }
  } else {
    report.method = 'dictionary';
  }

  return report;
}

function parseDictionary(res: NonNullable<Awaited<ReturnType<typeof unpackRSC7>>>, report: YtdReport) {
  const r = new ResourceReader(res);

  // TextureDictionary: ResourcePointerList64<Texture> Textures @ 0x30.
  const listPtr = r.ptr(0x30);
  const count = r.u16(0x38);
  report.declaredCount = count;
  const entriesOff = r.resolve(listPtr);
  report.entriesOffset = entriesOff;
  report.entriesResolved = entriesOff >= 0;

  if (entriesOff < 0) {
    report.notes.push(`Textures list pointer 0x${listPtr.toString(16)} did not resolve (systemSize=${res.systemSize}, buffer=${res.buffer.length}).`);
    return;
  }
  if (count === 0 || count > 8192) {
    report.notes.push(`Declared texture count is implausible (${count}).`);
    return;
  }

  const dumpFirst = 8; // raw hex for the first few entries
  for (let i = 0; i < count; i++) {
    const texPtr = r.ptr(entriesOff + i * 8);
    const t = r.resolve(texPtr);
    if (t < 0) {
      report.textures.push(reject(i, `entry_${i}`, 0, 0, 0, null, -1, `Texture pointer 0x${texPtr.toString(16)} did not resolve`));
      continue;
    }

    const p = parseTexture(r, t, res.buffer.length);
    const rawHex = i < dumpFirst ? hexDump(res.buffer, t, 0xa0) : undefined;

    if (!p.ok) {
      const rec = reject(i, p.name || `entry_${i}`, p.width, p.height, p.formatCode, p.format, t, p.reason);
      rec.formatFieldOffset = p.formatFieldOffset >= 0 ? p.formatFieldOffset : undefined;
      rec.rawHex = rawHex;
      report.textures.push(rec);
      continue;
    }

    const dec = p.format ? decoderFor(p.format) : null;
    const need = topMipBytes(p.format!, p.width, p.height);
    const avail = p.dataOff >= 0 ? res.buffer.length - p.dataOff : 0;

    const base: TextureRecord = {
      index: i, name: p.name, width: p.width, height: p.height, formatCode: p.formatCode,
      format: p.format, levels: p.levels, dataOffset: p.dataOff, bytesNeeded: need, bytesAvailable: avail,
      decoded: false, editable: false, livery: classifyLivery(p.name, p.width, p.height),
      reason: '', texOffset: t, formatFieldOffset: p.formatFieldOffset, rawHex,
    };

    if (!dec) { base.reason = `Metadata OK (${p.format} ${p.width}×${p.height}) — decoder for ${p.format} not implemented yet`; report.textures.push(base); continue; }
    if (p.dataOff < 0) { base.reason = `Metadata OK (${p.format} ${p.width}×${p.height}) but pixel-data pointer not found`; report.textures.push(base); continue; }
    if (need > avail) { base.reason = `Needs ${need} bytes but only ${avail} available past offset`; report.textures.push(base); continue; }

    const block = res.buffer.subarray(p.dataOff, p.dataOff + need);
    const rgba = decodeRawTexture(block, p.width, p.height, dec);
    if (!rgba) { base.reason = 'Block decode returned null'; report.textures.push(base); continue; }

    base.decoded = true; base.editable = true;
    base.reason = `Accepted — decoded ${p.format} ${p.width}×${p.height} (Format @+0x${p.formatFieldOffset.toString(16)})`;
    base.imageData = new ImageData(Uint8ClampedArray.from(rgba) as any, p.width, p.height);
    report.textures.push(base);
  }
}

function reject(
  index: number, name: string, width: number, height: number,
  formatCode: number, format: string | null, texOffset: number, reason: string
): TextureRecord {
  return {
    index, name, width, height, formatCode, format, levels: 0, dataOffset: -1,
    bytesNeeded: 0, bytesAvailable: 0, decoded: false, editable: false, livery: false,
    reason, texOffset: texOffset >= 0 ? texOffset : undefined,
  };
}

/** Convenience: just the editable textures (used by the editor). */
export async function loadYtdTextures(buffer: ArrayBuffer): Promise<VehicleTexture[]> {
  const report = await parseYtdDetailed(buffer);
  return report.textures
    .filter((t) => t.decoded && t.imageData)
    .map((t) => ({ name: t.name, width: t.width, height: t.height, format: t.format || 'unknown', imageData: t.imageData! }));
}
