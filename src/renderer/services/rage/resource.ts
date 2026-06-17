// RAGE resource container (RSC7) core.
// GTA .ytd/.yft/.ydr files are RSC7-wrapped, raw-deflate compressed, and split into
// a "system" (virtual) segment and a "graphics" (physical) segment. Internal pointers
// are 64-bit with the top nibble selecting the segment (0x5 = system, 0x6 = graphics).
//
// This module unpacks the container and exposes a pointer-resolving reader. The texture
// (ytd) and drawable (yft) parsers are built on top of it.

const RSC7_MAGIC = 0x37435352; // 'RSC7' little-endian

export interface RageResource {
  version: number;
  /** Decompressed system + graphics segments, concatenated. */
  buffer: Uint8Array;
  view: DataView;
  systemSize: number;
  graphicsSize: number;
}

/**
 * Decode a RAGE flags word into a byte size, using CodeWalker's canonical formula.
 */
export function sizeFromFlags(flags: number): number {
  const s0 = ((flags >>> 27) & 0x1) << 0;
  const s1 = ((flags >>> 26) & 0x1) << 1;
  const s2 = ((flags >>> 25) & 0x1) << 2;
  const s3 = ((flags >>> 24) & 0x1) << 3;
  const s4 = ((flags >>> 17) & 0x7f) << 4;
  const s5 = ((flags >>> 11) & 0x3f) << 5;
  const s6 = ((flags >>> 7) & 0xf) << 6;
  const s7 = ((flags >>> 5) & 0x3) << 7;
  const s8 = ((flags >>> 4) & 0x1) << 8;
  const ss = (flags >>> 0) & 0xf;
  const baseSize = 0x200 << ss;
  return baseSize * (s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8);
}

export function isRSC7(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const magic = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] * 0x1000000)) >>> 0;
  return magic === RSC7_MAGIC;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof (globalThis as any).DecompressionStream === 'undefined') return null;
  try {
    const ds = new (globalThis as any).DecompressionStream('deflate-raw');
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const resp = new Response(new Blob([ab]).stream().pipeThrough(ds));
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/** Unpack an RSC7 container into segments. Returns null if not RSC7 or decompression fails. */
export async function unpackRSC7(bytes: Uint8Array): Promise<RageResource | null> {
  if (!isRSC7(bytes)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getInt32(4, true);
  const systemFlags = dv.getUint32(8, true);
  const graphicsFlags = dv.getUint32(12, true);
  const systemSize = sizeFromFlags(systemFlags);
  const graphicsSize = sizeFromFlags(graphicsFlags);

  const inflated = await inflateRaw(bytes.subarray(16));
  if (!inflated || inflated.length < 16) return null;

  return {
    version,
    buffer: inflated,
    view: new DataView(inflated.buffer, inflated.byteOffset, inflated.byteLength),
    systemSize,
    graphicsSize: graphicsSize || Math.max(0, inflated.length - systemSize),
  };
}

/** Pointer-resolving reader over an unpacked resource. */
export class ResourceReader {
  readonly res: RageResource;
  readonly dv: DataView;
  private sysSize: number;

  constructor(res: RageResource) {
    this.res = res;
    this.dv = res.view;
    // If the flag-derived system size looks wrong, fall back to a best guess.
    this.sysSize = res.systemSize > 0 && res.systemSize < res.buffer.length
      ? res.systemSize
      : res.buffer.length;
  }

  /** Resolve a RAGE 64-bit pointer to a byte offset in the decompressed buffer, or -1. */
  resolve(ptr: number): number {
    if (!ptr) return -1;
    const seg = (ptr >>> 28) & 0xf;
    const off = ptr & 0x0fffffff;
    if (seg === 0x5) return off < this.sysSize ? off : -1;               // system
    if (seg === 0x6) {
      const abs = this.sysSize + off;
      return abs < this.res.buffer.length ? abs : -1;                    // graphics
    }
    return -1;
  }

  u8(o: number) { return this.dv.getUint8(o); }
  u16(o: number) { return this.dv.getUint16(o, true); }
  u32(o: number) { return this.dv.getUint32(o, true); }
  i32(o: number) { return this.dv.getInt32(o, true); }
  f32(o: number) { return this.dv.getFloat32(o, true); }
  /** Read a 64-bit pointer field (low 32 bits carry the segmented pointer). */
  ptr(o: number) { return this.dv.getUint32(o, true); }

  /** Read a null-terminated ASCII string at a resolved offset. */
  str(o: number, max = 128): string {
    if (o < 0) return '';
    let s = '';
    for (let i = 0; i < max; i++) {
      const c = this.dv.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
}
