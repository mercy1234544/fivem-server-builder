// DDS encoder — writes a valid uncompressed 32-bit BGRA DDS file from RGBA pixels.
// Uncompressed A8R8G8B8 is universally readable by OpenIV, CodeWalker, Paint.NET, GIMP.
// (DXT block compression can be layered in later behind the same signature.)

const DDS_MAGIC = 0x20534444; // "DDS "

const DDSD_CAPS        = 0x1;
const DDSD_HEIGHT      = 0x2;
const DDSD_WIDTH       = 0x4;
const DDSD_PITCH       = 0x8;
const DDSD_PIXELFORMAT = 0x1000;

const DDPF_ALPHAPIXELS = 0x1;
const DDPF_RGB         = 0x40;

const DDSCAPS_TEXTURE  = 0x1000;

/** Encode an RGBA pixel buffer (top-to-bottom) into an uncompressed BGRA DDS file. */
export function encodeDDS(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const headerSize = 128; // 4 magic + 124 header
  const pixelBytes = width * height * 4;
  const out = new Uint8Array(headerSize + pixelBytes);
  const dv  = new DataView(out.buffer);

  dv.setUint32(0,  DDS_MAGIC, true);
  dv.setUint32(4,  124, true);                                              // dwSize
  dv.setUint32(8,  DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PITCH | DDSD_PIXELFORMAT, true); // dwFlags
  dv.setUint32(12, height, true);
  dv.setUint32(16, width, true);
  dv.setUint32(20, width * 4, true);                                       // pitch
  dv.setUint32(24, 0, true);                                               // depth
  dv.setUint32(28, 0, true);                                               // mipMapCount
  // 11 reserved dwords (offsets 32..75) left zero

  // DDS_PIXELFORMAT @ offset 76
  dv.setUint32(76, 32, true);                                              // pf size
  dv.setUint32(80, DDPF_RGB | DDPF_ALPHAPIXELS, true);                     // pf flags
  dv.setUint32(84, 0, true);                                               // fourCC
  dv.setUint32(88, 32, true);                                              // rgbBitCount
  dv.setUint32(92,  0x00ff0000, true);                                     // R mask
  dv.setUint32(96,  0x0000ff00, true);                                     // G mask
  dv.setUint32(100, 0x000000ff, true);                                     // B mask
  dv.setUint32(104, 0xff000000, true);                                     // A mask

  dv.setUint32(108, DDSCAPS_TEXTURE, true);                                // caps
  // caps2/3/4 + reserved2 left zero (offsets 112..123)

  // Pixel data — convert RGBA -> BGRA
  let o = headerSize;
  for (let i = 0; i < pixelBytes; i += 4) {
    out[o++] = rgba[i + 2]; // B
    out[o++] = rgba[i + 1]; // G
    out[o++] = rgba[i];     // R
    out[o++] = rgba[i + 3]; // A
  }
  return out;
}

/** Pull RGBA pixels out of a canvas and encode them as a DDS file. */
export function canvasToDDS(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d')!;
  const id  = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodeDDS(id.data, canvas.width, canvas.height);
}

// ── BC1 / DXT1 encoder ────────────────────────────────────────────────────────

function rgb565(r: number, g: number, b: number): number {
  return (((r >> 3) & 0x1f) << 11) | (((g >> 2) & 0x3f) << 5) | ((b >> 3) & 0x1f);
}
function rgb565Unpack(c: number): [number, number, number] {
  return [((c >> 11) & 0x1f) * 255 / 31, ((c >> 5) & 0x3f) * 255 / 63, (c & 0x1f) * 255 / 31];
}

function encodeDXT1Block(rgba: Uint8ClampedArray | Uint8Array, srcW: number, bx: number, by: number, w: number, h: number): Uint8Array {
  // Extract 4×4 block (clamped at edges)
  const R = new Uint8Array(16), G = new Uint8Array(16), B = new Uint8Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const sx = Math.min(bx + c, w - 1), sy = Math.min(by + r, h - 1);
      const i = (sy * srcW + sx) * 4;
      R[r * 4 + c] = rgba[i]; G[r * 4 + c] = rgba[i + 1]; B[r * 4 + c] = rgba[i + 2];
    }
  }
  // Find extremal colors along principal RGB axis (simple min/max per channel)
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
  for (let i = 0; i < 16; i++) {
    if (R[i] < minR) minR = R[i]; if (R[i] > maxR) maxR = R[i];
    if (G[i] < minG) minG = G[i]; if (G[i] > maxG) maxG = G[i];
    if (B[i] < minB) minB = B[i]; if (B[i] > maxB) maxB = B[i];
  }
  let c0 = rgb565(maxR, maxG, maxB), c1 = rgb565(minR, minG, minB);
  // Ensure 4-color mode (c0 > c1)
  if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
  const [r0, g0, b0] = rgb565Unpack(c0);
  const [r1, g1, b1] = rgb565Unpack(c1);
  const pal: [number, number, number][] = [
    [r0, g0, b0], [r1, g1, b1],
    [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
    [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3],
  ];
  // Build index rows
  let idx = 0;
  for (let i = 0; i < 16; i++) {
    let best = 0, bd = 1e18;
    for (let j = 0; j < 4; j++) {
      const d = (R[i] - pal[j][0]) ** 2 + (G[i] - pal[j][1]) ** 2 + (B[i] - pal[j][2]) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    idx |= best << (i * 2);
  }
  const out = new Uint8Array(8);
  out[0] = c0 & 0xff; out[1] = (c0 >> 8) & 0xff;
  out[2] = c1 & 0xff; out[3] = (c1 >> 8) & 0xff;
  out[4] = idx & 0xff; out[5] = (idx >> 8) & 0xff; out[6] = (idx >> 16) & 0xff; out[7] = (idx >> 24) & 0xff;
  return out;
}

/**
 * Encode RGBA pixels to a raw DXT1/BC1 block stream (NO DDS header).
 * Width and height must be multiples of 4, or will be padded.
 */
export function encodeRawDXT1(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const bw = Math.ceil(width / 4), bh = Math.ceil(height / 4);
  const out = new Uint8Array(bw * bh * 8); let off = 0;
  for (let by = 0; by < height; by += 4)
    for (let bx = 0; bx < width; bx += 4) {
      out.set(encodeDXT1Block(rgba, width, bx, by, width, height), off); off += 8;
    }
  return out;
}

/** Downsample an RGBA buffer by 2× (for mip generation). */
export function downsample2x(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): { data: Uint8Array; w: number; h: number } {
  const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
  const out = new Uint8Array(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const i0 = ((y * 2) * w + x * 2) * 4, i1 = ((y * 2) * w + x * 2 + 1) * 4;
    const i2 = ((y * 2 + 1) * w + x * 2) * 4, i3 = ((y * 2 + 1) * w + x * 2 + 1) * 4;
    const o = (y * w2 + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = (rgba[i0 + c] + rgba[i1 + c] + rgba[i2 + c] + rgba[i3 + c]) >> 2;
  }
  return { data: out, w: w2, h: h2 };
}

/** Build all mip levels of DXT1 pixel data for a canvas. */
export function buildMipChainDXT1(canvas: HTMLCanvasElement, levels: number): Uint8Array {
  const ctx = canvas.getContext('2d')!;
  let id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let rgba: Uint8ClampedArray | Uint8Array = id.data;
  let w = canvas.width, h = canvas.height;
  const chunks: Uint8Array[] = [];
  for (let mip = 0; mip < levels; mip++) {
    chunks.push(encodeRawDXT1(rgba, w, h));
    if (w <= 1 && h <= 1) break;
    const ds = downsample2x(rgba, w, h);
    rgba = ds.data; w = ds.w; h = ds.h;
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
