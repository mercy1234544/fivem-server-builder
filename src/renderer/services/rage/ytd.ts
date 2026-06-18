// YTD (texture dictionary) parser built on the RAGE resource core.
// Reads real grcTexture entries out of a genuine GTA .ytd and decodes them to RGBA.
// Produces a full diagnostic report at every step — nothing fails silently.

import { unpackRSC7, ResourceReader, isRSC7 } from './resource';
import { decodeRawTexture, extractTexturesFromYTD, ddsToImageData } from '../ytdParser';

export interface TextureRecord {
  index: number;
  name: string;
  width: number;
  height: number;
  formatCode: number;
  format: string | null;
  dataOffset: number;
  bytesNeeded: number;
  bytesAvailable: number;
  decoded: boolean;
  editable: boolean;
  livery: boolean;
  reason: string;
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

// RAGE / D3D texture format codes -> our decoder format.
function formatName(code: number): 'DXT1' | 'DXT3' | 'DXT5' | 'BGRA8' | 'RGBA8' | null {
  switch (code >>> 0) {
    case 0x31545844: return 'DXT1';  // 'DXT1'
    case 0x33545844: return 'DXT3';  // 'DXT3'
    case 0x35545844: return 'DXT5';  // 'DXT5'
    case 21: return 'BGRA8';         // D3DFMT_A8R8G8B8
    case 32: return 'RGBA8';         // D3DFMT_A8B8G8R8
    default: return null;
  }
}

function fourCCName(code: number): string {
  const c = code >>> 0;
  const ascii = String.fromCharCode(c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff, (c >> 24) & 0xff)
    .replace(/[^\x20-\x7e]/g, '·');
  return `0x${c.toString(16).toUpperCase().padStart(8, '0')} ("${ascii}")`;
}

function topMipBytes(format: string, w: number, h: number): number {
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  if (format === 'DXT1') return bw * bh * 8;
  if (format === 'DXT3' || format === 'DXT5') return bw * bh * 16;
  return w * h * 4;
}

const LIVERY_RE = /sign|livery|liv\d|_l\d|lvl|decal|skin|paint|template|markings?/i;

function classifyLivery(name: string, w: number, h: number): boolean {
  return LIVERY_RE.test(name) || (w >= 1024 && h >= 1024);
}

/** Parse a YTD with full diagnostics. Never throws; records every decision. */
export async function parseYtdDetailed(buffer: ArrayBuffer): Promise<YtdReport> {
  const bytes = new Uint8Array(buffer);
  const report: YtdReport = {
    isRSC7: isRSC7(bytes), inflated: false, method: 'none',
    declaredCount: 0, entriesResolved: false, textures: [], notes: [],
  };

  // 1) Try the real grcTexture dictionary (preferred).
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
      try {
        parseDictionary(res, report);
      } catch (e: any) {
        report.notes.push(`Dictionary parse threw: ${e?.message || e}`);
      }
    }
  } else {
    report.notes.push('File does not start with the RSC7 magic. It may be an uncompressed or non-standard YTD.');
  }

  const decodedFromDict = report.textures.filter((t) => t.decoded).length;

  // 2) Fallback: embedded-DDS scan (for hand-built / modified dictionaries).
  if (decodedFromDict === 0) {
    try {
      const embedded = await extractTexturesFromYTD(buffer);
      if (embedded.length > 0) {
        report.method = 'embedded-dds';
        report.notes.push(`Dictionary yielded no decodable textures — fell back to embedded-DDS scan (${embedded.length} found).`);
        embedded.forEach((t, i) => {
          const id = ddsToImageData(t.ddsBytes);
          report.textures.push({
            index: report.textures.length, name: t.name, width: t.width, height: t.height,
            formatCode: 0, format: t.format, dataOffset: -1,
            bytesNeeded: 0, bytesAvailable: t.ddsBytes.length,
            decoded: !!id, editable: !!id, livery: classifyLivery(t.name, t.width, t.height),
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

function parseDictionary(res: Awaited<ReturnType<typeof unpackRSC7>>, report: YtdReport) {
  if (!res) return;
  const r = new ResourceReader(res);

  // TextureDictionary: ResourcePointerList64<Texture> Textures @ 0x30.
  const listPtr = r.ptr(0x30);
  const count = r.u16(0x38);
  report.declaredCount = count;
  const entriesOff = r.resolve(listPtr);
  report.entriesResolved = entriesOff >= 0;

  if (entriesOff < 0) {
    report.notes.push(`Textures list pointer 0x${listPtr.toString(16)} did not resolve (systemSize=${res.systemSize}, buffer=${res.buffer.length}).`);
    return;
  }
  if (count === 0 || count > 4096) {
    report.notes.push(`Declared texture count is implausible (${count}). Dictionary offsets may be wrong for this file.`);
    return;
  }

  for (let i = 0; i < count; i++) {
    const texPtr = r.ptr(entriesOff + i * 8);
    const t = r.resolve(texPtr);
    if (t < 0) {
      report.textures.push(reject(i, 'unnamed', 0, 0, 0, -1, 0, 0, `Texture pointer 0x${texPtr.toString(16)} did not resolve`));
      continue;
    }
    const nameOff = r.resolve(r.ptr(t + 0x20));
    const width = r.u16(t + 0x40);
    const height = r.u16(t + 0x42);
    const fmtCode = r.u32(t + 0x48);
    const dataOff = r.resolve(r.ptr(t + 0x60));
    const name = nameOff >= 0 ? (r.str(nameOff) || `texture_${i}`) : `texture_${i}`;
    const fmt = formatName(fmtCode);

    if (!fmt) {
      report.textures.push(reject(i, name, width, height, fmtCode, dataOff, 0, 0, `Unsupported/Unknown format ${fourCCName(fmtCode)}`));
      continue;
    }
    if (width < 1 || height < 1 || width > 16384 || height > 16384) {
      report.textures.push(reject(i, name, width, height, fmtCode, dataOff, 0, 0, `Implausible dimensions ${width}×${height} (offsets likely wrong)`));
      continue;
    }
    const need = topMipBytes(fmt, width, height);
    const avail = dataOff >= 0 ? res.buffer.length - dataOff : 0;
    if (dataOff < 0) {
      report.textures.push(reject(i, name, width, height, fmtCode, dataOff, need, 0, 'Pixel-data pointer did not resolve'));
      continue;
    }
    if (need > avail) {
      report.textures.push(reject(i, name, width, height, fmtCode, dataOff, need, avail, `Needs ${need} bytes but only ${avail} available past offset`));
      continue;
    }
    const block = res.buffer.subarray(dataOff, dataOff + need);
    const rgba = decodeRawTexture(block, width, height, fmt);
    if (!rgba) {
      report.textures.push(reject(i, name, width, height, fmtCode, dataOff, need, avail, 'Block decode returned null'));
      continue;
    }
    report.textures.push({
      index: i, name, width, height, formatCode: fmtCode, format: fmt,
      dataOffset: dataOff, bytesNeeded: need, bytesAvailable: avail,
      decoded: true, editable: true, livery: classifyLivery(name, width, height),
      reason: `Accepted — decoded ${fmt} ${width}×${height}`,
      imageData: new ImageData(Uint8ClampedArray.from(rgba) as any, width, height),
    });
  }
}

function reject(
  index: number, name: string, width: number, height: number, formatCode: number,
  dataOffset: number, bytesNeeded: number, bytesAvailable: number, reason: string
): TextureRecord {
  return {
    index, name, width, height, formatCode, format: formatName(formatCode),
    dataOffset, bytesNeeded, bytesAvailable, decoded: false, editable: false,
    livery: false, reason,
  };
}

/** Convenience: just the editable textures (used by the editor). */
export async function loadYtdTextures(buffer: ArrayBuffer): Promise<VehicleTexture[]> {
  const report = await parseYtdDetailed(buffer);
  return report.textures
    .filter((t) => t.decoded && t.imageData)
    .map((t) => ({ name: t.name, width: t.width, height: t.height, format: t.format || 'unknown', imageData: t.imageData! }));
}
