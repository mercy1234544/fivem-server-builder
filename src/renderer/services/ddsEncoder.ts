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
