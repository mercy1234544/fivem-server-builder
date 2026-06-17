// YTD / DDS texture parser
// Scans GTA V texture dictionary files for embedded DDS textures and decodes them.

export interface ExtractedTexture {
  index: number;
  name: string;
  width: number;
  height: number;
  format: 'DXT1' | 'DXT3' | 'DXT5' | 'RGBA8' | 'BGRA8' | 'unknown';
  mips: number;
  ddsBytes: Uint8Array;
}

const DDS_MAGIC = 0x20534444; // "DDS "
const DXT1      = 0x31545844;
const DXT3      = 0x33545844;
const DXT5      = 0x35545844;

function rgb565(c: number): [number, number, number] {
  const r = ((c >> 11) & 0x1f); const g = ((c >> 5) & 0x3f); const b = c & 0x1f;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

function decodeDXT1Block(src: Uint8Array, si: number, dst: Uint8ClampedArray, bx: number, by: number, w: number) {
  const c0 = src[si] | (src[si+1] << 8);
  const c1 = src[si+2] | (src[si+3] << 8);
  let bits = src[si+4] | (src[si+5]<<8) | (src[si+6]<<16) | (src[si+7]*16777216);
  const [r0,g0,b0] = rgb565(c0); const [r1,g1,b1] = rgb565(c1);
  const cs: [number,number,number,number][] = [
    [r0,g0,b0,255],[r1,g1,b1,255],[0,0,0,0],[0,0,0,0]
  ];
  if (c0 > c1) {
    cs[2] = [((2*r0+r1)/3)|0,((2*g0+g1)/3)|0,((2*b0+b1)/3)|0,255];
    cs[3] = [((r0+2*r1)/3)|0,((g0+2*g1)/3)|0,((b0+2*b1)/3)|0,255];
  } else {
    cs[2] = [((r0+r1)/2)|0,((g0+g1)/2)|0,((b0+b1)/2)|0,255];
    cs[3] = [0,0,0,0];
  }
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) {
    const px=bx+c; const py=by+r;
    if (px>=w) continue;
    const idx=bits&3; bits>>=2;
    const di=(py*w+px)*4;
    dst[di]=cs[idx][0]; dst[di+1]=cs[idx][1]; dst[di+2]=cs[idx][2]; dst[di+3]=cs[idx][3];
  }
}

function decodeDXT5AlphaBlock(src: Uint8Array, si: number): number[] {
  const a0=src[si]; const a1=src[si+1];
  const alphas=[a0,a1,0,0,0,0,0,0];
  if (a0>a1) {
    for(let i=2;i<8;i++) alphas[i]=((8-i)*a0+(i-1)*a1)/7|0;
  } else {
    for(let i=2;i<6;i++) alphas[i]=((6-i)*a0+(i-1)*a1)/5|0;
    alphas[6]=0; alphas[7]=255;
  }
  const bits: number[] = [];
  let lo=(src[si+2])|(src[si+3]<<8)|(src[si+4]<<16);
  let hi=(src[si+5])|(src[si+6]<<8)|(src[si+7]<<16);
  for(let i=0;i<8;i++){ bits.push(lo&7); lo>>=3; }
  for(let i=0;i<8;i++){ bits.push(hi&7); hi>>=3; }
  return bits.map(b=>alphas[b]);
}

function decodeDXT5Block(src: Uint8Array, si: number, dst: Uint8ClampedArray, bx: number, by: number, w: number) {
  const alphas = decodeDXT5AlphaBlock(src, si);
  const c0=(src[si+8])|(src[si+9]<<8);
  const c1=(src[si+10])|(src[si+11]<<8);
  let bits=(src[si+12])|(src[si+13]<<8)|(src[si+14]<<16)|(src[si+15]*16777216);
  const [r0,g0,b0]=rgb565(c0); const [r1,g1,b1]=rgb565(c1);
  const cs: [number,number,number][] = [
    [r0,g0,b0],[r1,g1,b1],
    [((2*r0+r1)/3)|0,((2*g0+g1)/3)|0,((2*b0+b1)/3)|0],
    [((r0+2*r1)/3)|0,((g0+2*g1)/3)|0,((b0+2*b1)/3)|0],
  ];
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) {
    const px=bx+c; const py=by+r;
    if (px>=w) continue;
    const ci=bits&3; bits>>=2;
    const di=(py*w+px)*4;
    dst[di]=cs[ci][0]; dst[di+1]=cs[ci][1]; dst[di+2]=cs[ci][2]; dst[di+3]=alphas[r*4+c];
  }
}

export function decodeDDS(dds: Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray; format: string } | null {
  const v = new DataView(dds.buffer, dds.byteOffset, dds.byteLength);
  if (v.getUint32(0, true) !== DDS_MAGIC) return null;
  const height = v.getUint32(12, true);
  const width  = v.getUint32(16, true);
  const pfFlags= v.getUint32(80, true);
  const fourCC = v.getUint32(84, true);
  const rgbBits= v.getUint32(88, true);

  const dataOffset = 128;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const data = dds.subarray(dataOffset);
  const bw = Math.max(1, Math.floor((width+3)/4));
  const bh = Math.max(1, Math.floor((height+3)/4));

  if (fourCC === DXT1) {
    for (let by=0;by<bh;by++) for (let bx=0;bx<bw;bx++) {
      decodeDXT1Block(data,(by*bw+bx)*8,rgba,bx*4,by*4,width);
    }
    return { width, height, rgba, format: 'DXT1' };
  }
  if (fourCC === DXT5 || fourCC === DXT3) {
    for (let by=0;by<bh;by++) for (let bx=0;bx<bw;bx++) {
      decodeDXT5Block(data,(by*bw+bx)*16,rgba,bx*4,by*4,width);
    }
    return { width, height, rgba, format: fourCC===DXT5?'DXT5':'DXT3' };
  }
  // Uncompressed RGBA/BGRA
  if (pfFlags & 0x40) {
    const isBGRA = (v.getUint32(92,true) & 0xff) === 0; // rough heuristic
    for (let i=0;i<width*height;i++) {
      if (isBGRA) {
        rgba[i*4]=data[i*4+2]; rgba[i*4+1]=data[i*4+1]; rgba[i*4+2]=data[i*4]; rgba[i*4+3]=rgbBits===32?data[i*4+3]:255;
      } else {
        rgba[i*4]=data[i*4]; rgba[i*4+1]=data[i*4+1]; rgba[i*4+2]=data[i*4+2]; rgba[i*4+3]=rgbBits===32?data[i*4+3]:255;
      }
    }
    return { width, height, rgba, format: 'RGBA8' };
  }
  return null;
}

/** Decode raw (non-DDS) texture block data of a known format into RGBA. */
export function decodeRawTexture(
  data: Uint8Array, width: number, height: number,
  format: 'DXT1' | 'DXT3' | 'DXT5' | 'BGRA8' | 'RGBA8'
): Uint8ClampedArray | null {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const bw = Math.max(1, (width + 3) >> 2);
  const bh = Math.max(1, (height + 3) >> 2);
  try {
    if (format === 'DXT1') {
      if (data.length < bw * bh * 8) return null;
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++)
        decodeDXT1Block(data, (by * bw + bx) * 8, rgba, bx * 4, by * 4, width);
    } else if (format === 'DXT5' || format === 'DXT3') {
      if (data.length < bw * bh * 16) return null;
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++)
        decodeDXT5Block(data, (by * bw + bx) * 16, rgba, bx * 4, by * 4, width);
    } else if (format === 'BGRA8') {
      if (data.length < width * height * 4) return null;
      for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = data[i * 4 + 2]; rgba[i * 4 + 1] = data[i * 4 + 1];
        rgba[i * 4 + 2] = data[i * 4]; rgba[i * 4 + 3] = data[i * 4 + 3];
      }
    } else {
      if (data.length < width * height * 4) return null;
      rgba.set(data.subarray(0, width * height * 4));
    }
    return rgba;
  } catch {
    return null;
  }
}

export function ddsToImageData(dds: Uint8Array): ImageData | null {
  const result = decodeDDS(dds);
  if (!result) return null;
  return new ImageData(new Uint8ClampedArray(result.rgba.buffer as ArrayBuffer), result.width, result.height);
}

export function extractTexturesFromBuffer(buffer: ArrayBuffer): ExtractedTexture[] {
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);
  const results: ExtractedTexture[] = [];
  let index = 0;

  for (let i = 0; i < bytes.length - 4; i++) {
    if (view.getUint32(i, true) !== DDS_MAGIC) continue;
    if (i + 128 > bytes.length) continue;

    const height  = view.getUint32(i+12, true);
    const width   = view.getUint32(i+16, true);
    const mips    = Math.max(1, view.getUint32(i+28, true));
    const fourCC  = view.getUint32(i+84, true);
    const pfFlags = view.getUint32(i+80, true);
    const rgbBits = view.getUint32(i+88, true);

    if (width < 4 || height < 4 || width > 8192 || height > 8192) continue;

    let format: ExtractedTexture['format'] = 'unknown';
    let byteSize = 0;

    if (fourCC === DXT1) {
      format = 'DXT1';
      let w=width, h=height, total=0;
      for (let m=0;m<mips;m++){ total+=Math.max(1,Math.floor((w+3)/4))*Math.max(1,Math.floor((h+3)/4))*8; w=Math.max(1,w>>1); h=Math.max(1,h>>1); }
      byteSize = total;
    } else if (fourCC === DXT5) {
      format = 'DXT5';
      let w=width, h=height, total=0;
      for (let m=0;m<mips;m++){ total+=Math.max(1,Math.floor((w+3)/4))*Math.max(1,Math.floor((h+3)/4))*16; w=Math.max(1,w>>1); h=Math.max(1,h>>1); }
      byteSize = total;
    } else if (fourCC === DXT3) {
      format = 'DXT3';
      let w=width, h=height, total=0;
      for (let m=0;m<mips;m++){ total+=Math.max(1,Math.floor((w+3)/4))*Math.max(1,Math.floor((h+3)/4))*16; w=Math.max(1,w>>1); h=Math.max(1,h>>1); }
      byteSize = total;
    } else if (pfFlags & 0x40) {
      format = rgbBits === 32 ? 'RGBA8' : 'BGRA8';
      let w=width, h=height, total=0;
      for (let m=0;m<mips;m++){ total+=w*h*(rgbBits/8); w=Math.max(1,w>>1); h=Math.max(1,h>>1); }
      byteSize = total;
    } else {
      continue; // unknown format, skip
    }

    const totalBytes = 128 + byteSize;
    if (i + totalBytes > bytes.length + 4096) continue; // allow small overread for padding

    const end = Math.min(i + totalBytes, bytes.length);
    const ddsBytes = bytes.slice(i, end);
    results.push({ index, name: `texture_${index}`, width, height, format, mips, ddsBytes });
    index++;
    i += Math.max(0, totalBytes - 1);
  }
  return results;
}

// ─── RSC7 (GTA resource container) support ──────────────────────────────────
// Real .ytd files are wrapped in an RSC7 header and raw-deflate compressed.
// We transparently decompress before scanning for embedded DDS textures.

const RSC7_MAGIC = 0x37435352; // 'RSC7'

function isRSC7(bytes: Uint8Array): boolean {
  return bytes.length > 16 && (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] * 16777216)) >>> 0 === RSC7_MAGIC;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof (globalThis as any).DecompressionStream === 'undefined') return null;
  try {
    const ds = new (globalThis as any).DecompressionStream('deflate-raw');
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const stream = new Response(new Blob([ab]).stream().pipeThrough(ds));
    const buf = await stream.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/**
 * Extract textures from a .ytd/.dds buffer, transparently handling RSC7
 * compression. Always async because decompression uses streams.
 */
export async function extractTexturesFromYTD(buffer: ArrayBuffer): Promise<ExtractedTexture[]> {
  const bytes = new Uint8Array(buffer);

  // Direct embedded-DDS scan first (works for uncompressed / hand-built YTDs).
  const direct = extractTexturesFromBuffer(buffer);
  if (direct.length > 0) return direct;

  // RSC7-wrapped: decompress the payload (skip the 16-byte header) and rescan.
  if (isRSC7(bytes)) {
    const payload = bytes.subarray(16);
    const inflated = await inflateRaw(payload);
    if (inflated && inflated.length > 128) {
      const ab = inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength) as ArrayBuffer;
      return extractTexturesFromBuffer(ab);
    }
  }

  return [];
}
