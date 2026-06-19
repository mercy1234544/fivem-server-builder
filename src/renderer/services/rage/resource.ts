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

export interface UnpackDetails {
  resource: RageResource | null;
  /** Why we succeeded or failed. */
  method: 'deflate-raw' | 'deflate' | 'uncompressed' | 'failed';
  failReason?: string;
  /** Hex of first 16 bytes of the payload (after the 16-byte RSC7 header). */
  payloadPeekHex: string;
  version: number;
  systemFlags: number;
  graphicsFlags: number;
  systemSize: number;
  graphicsSize: number;
  compressedPayloadSize: number;
  decompressedSize: number;
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

async function tryDecompress(data: Uint8Array, format: 'deflate-raw' | 'deflate'): Promise<Uint8Array | null> {
  if (typeof (globalThis as any).DecompressionStream === 'undefined') return null;
  try {
    const ds  = new (globalThis as any).DecompressionStream(format);
    // Slice correctly even if data is a sub-view with non-zero byteOffset.
    const ab  = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const out = new Response(new Blob([ab]).stream().pipeThrough(ds));
    const result = new Uint8Array(await out.arrayBuffer());
    return result.length >= 4 ? result : null;
  } catch {
    return null;
  }
}

/** Full unpack with diagnostic details — preferred for the YFT parser. */
export async function unpackRSC7Detailed(bytes: Uint8Array): Promise<UnpackDetails> {
  const empty = (method: UnpackDetails['method'], failReason?: string): UnpackDetails => ({
    resource: null, method, failReason,
    payloadPeekHex: '', version: 0, systemFlags: 0, graphicsFlags: 0,
    systemSize: 0, graphicsSize: 0, compressedPayloadSize: 0, decompressedSize: 0,
  });

  if (!isRSC7(bytes)) return empty('failed', 'RSC7 magic not found in first 4 bytes');
  if (bytes.length < 17)  return empty('failed', 'File too small to be a valid RSC7 (< 17 bytes)');

  const dv           = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version      = dv.getInt32(4, true);
  const systemFlags  = dv.getUint32(8, true);
  const graphicsFlags= dv.getUint32(12, true);
  const systemSize   = sizeFromFlags(systemFlags);
  const graphicsSize = sizeFromFlags(graphicsFlags);

  const payload = bytes.subarray(16);

  // Hex of first 16 payload bytes for diagnosis.
  const peek: string[] = [];
  for (let i = 0; i < Math.min(16, payload.length); i++)
    peek.push(payload[i].toString(16).padStart(2, '0'));
  const payloadPeekHex = peek.join(' ');

  const fill = (inflated: Uint8Array, method: UnpackDetails['method']): UnpackDetails => {
    const gs = graphicsSize || Math.max(0, inflated.length - systemSize);
    return {
      resource: {
        version, buffer: inflated,
        view: new DataView(inflated.buffer, inflated.byteOffset, inflated.byteLength),
        systemSize, graphicsSize: gs,
      },
      method, payloadPeekHex, version, systemFlags, graphicsFlags,
      systemSize, graphicsSize, compressedPayloadSize: payload.length,
      decompressedSize: inflated.length,
    };
  };

  // Strategy 1: raw deflate (standard GTA V — most common)
  const rawResult = await tryDecompress(payload, 'deflate-raw');
  if (rawResult) return fill(rawResult, 'deflate-raw');

  // Strategy 2: zlib-wrapped deflate (some modding tools / older exports)
  const zlibResult = await tryDecompress(payload, 'deflate');
  if (zlibResult) return fill(zlibResult, 'deflate');

  // Strategy 3: uncompressed passthrough.
  // Some RSC7 writers skip compression entirely (e.g. FiveM streaming resources built
  // by certain tools). The payload IS the segment data. We accept this if the raw
  // payload is at least 32 bytes so we don't silently accept obviously broken data.
  if (payload.length >= 32) {
    // Return raw bytes so the caller can at least run diagnostics on the real data.
    return fill(payload, 'uncompressed');
  }

  return empty('failed',
    `All decompression strategies failed. Payload first bytes: ${payloadPeekHex}. ` +
    `RSC7 version=${version} sysFlags=0x${systemFlags.toString(16)} gfxFlags=0x${graphicsFlags.toString(16)}`
  );
}

/** Simple wrapper kept for YTD compatibility. */
export async function unpackRSC7(bytes: Uint8Array): Promise<RageResource | null> {
  const d = await unpackRSC7Detailed(bytes);
  return d.resource;
}

/** Pointer-resolving reader over an unpacked resource. */
export class ResourceReader {
  readonly res: RageResource;
  readonly dv: DataView;
  private sysSize: number;

  constructor(res: RageResource) {
    this.res = res;
    this.dv  = res.view;
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

  u8(o: number)  { return this.dv.getUint8(o); }
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
