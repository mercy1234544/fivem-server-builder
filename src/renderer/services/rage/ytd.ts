// YTD (texture dictionary) parser built on the RAGE resource core.
// Reads the real grcTexture entries — names, dimensions, format, and pixel data —
// out of a genuine GTA .ytd, decoding them to RGBA. Falls back to an embedded-DDS
// scan for hand-built / modified dictionaries that store full DDS files.

import { unpackRSC7, ResourceReader } from './resource';
import { decodeRawTexture, extractTexturesFromYTD, ddsToImageData } from '../ytdParser';

export interface VehicleTexture {
  name: string;
  width: number;
  height: number;
  format: string;
  imageData: ImageData;
}

// D3D / RAGE texture format codes -> our decoder format.
function formatName(code: number): 'DXT1' | 'DXT3' | 'DXT5' | 'BGRA8' | 'RGBA8' | null {
  switch (code >>> 0) {
    case 0x31545844: return 'DXT1'; // 'DXT1'
    case 0x33545844: return 'DXT3'; // 'DXT3'
    case 0x35545844: return 'DXT5'; // 'DXT5'
    case 21: return 'BGRA8'; // A8R8G8B8 (D3DFMT_A8R8G8B8)
    case 28: return 'RGBA8';            // A8B8G8R8
    default: return null;
  }
}

function topMipBytes(format: string, w: number, h: number): number {
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  if (format === 'DXT1') return bw * bh * 8;
  if (format === 'DXT3' || format === 'DXT5') return bw * bh * 16;
  return w * h * 4;
}

/**
 * Parse the grcTexture dictionary of a real YTD. Returns [] (caller should fall
 * back) if the structure doesn't validate, so a wrong guess never yields garbage.
 */
async function parseTextureDictionary(bytes: Uint8Array): Promise<VehicleTexture[]> {
  const res = await unpackRSC7(bytes);
  if (!res) return [];
  const r = new ResourceReader(res);
  const out: VehicleTexture[] = [];

  try {
    // TextureDictionary: ResourcePointerList64<Texture> Textures @ 0x30.
    const listPtr = r.ptr(0x30);
    const count = r.u16(0x38);
    const entriesOff = r.resolve(listPtr);
    if (entriesOff < 0 || count === 0 || count > 4096) return [];

    for (let i = 0; i < count; i++) {
      const texPtr = r.ptr(entriesOff + i * 8);
      const t = r.resolve(texPtr);
      if (t < 0) continue;

      const nameOff = r.resolve(r.ptr(t + 0x20));
      const width = r.u16(t + 0x40);
      const height = r.u16(t + 0x42);
      const fmtCode = r.u32(t + 0x48);
      const dataOff = r.resolve(r.ptr(t + 0x60));

      const fmt = formatName(fmtCode);
      if (!fmt || width < 1 || height < 1 || width > 16384 || height > 16384 || dataOff < 0) continue;

      const need = topMipBytes(fmt, width, height);
      if (dataOff + need > res.buffer.length) continue;

      const block = res.buffer.subarray(dataOff, dataOff + need);
      const rgba = decodeRawTexture(block, width, height, fmt);
      if (!rgba) continue;

      out.push({
        name: r.str(nameOff) || `texture_${i}`,
        width, height, format: fmt,
        imageData: new ImageData(Uint8ClampedArray.from(rgba) as any, width, height),
      });
    }
  } catch {
    return out;
  }
  return out;
}

/** Load all decodable textures from a YTD buffer (real dictionary first, DDS scan fallback). */
export async function loadYtdTextures(buffer: ArrayBuffer): Promise<VehicleTexture[]> {
  const bytes = new Uint8Array(buffer);

  const dict = await parseTextureDictionary(bytes);
  if (dict.length > 0) return dict;

  // Fallback: embedded-DDS scan (handles uncompressed / hand-built dictionaries).
  const embedded = await extractTexturesFromYTD(buffer);
  const out: VehicleTexture[] = [];
  for (const t of embedded) {
    const id = ddsToImageData(t.ddsBytes);
    if (id) out.push({ name: t.name, width: t.width, height: t.height, format: t.format, imageData: id });
  }
  return out;
}
