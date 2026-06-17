// Export abstraction layer.
// Today: PNG + uncompressed DDS. Tomorrow: full YTD (RSC7) rebuild can be added
// as just another LiveryExporter with no changes to callers.

import { canvasToDDS } from './ddsEncoder';

export interface ExportResult {
  blob: Blob;
  filename: string;
}

export interface LiveryExporter {
  id: string;
  label: string;
  ext: string;
  /** True when the exporter is implemented and safe to use. */
  ready: boolean;
  export(canvas: HTMLCanvasElement, baseName: string): Promise<ExportResult>;
}

const pngExporter: LiveryExporter = {
  id: 'png',
  label: 'PNG',
  ext: 'png',
  ready: true,
  export: (canvas, baseName) =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('PNG encode failed'));
        resolve({ blob, filename: `${baseName}.png` });
      }, 'image/png');
    }),
};

const ddsExporter: LiveryExporter = {
  id: 'dds',
  label: 'DDS (uncompressed)',
  ext: 'dds',
  ready: true,
  export: async (canvas, baseName) => {
    const bytes = canvasToDDS(canvas);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { blob: new Blob([ab], { type: 'image/vnd-ms.dds' }), filename: `${baseName}.dds` };
  },
};

// Placeholder for the future RSC7 container writer. Wired in but not enabled,
// so the UI can list it and we can implement export() later with zero refactor.
const ytdExporter: LiveryExporter = {
  id: 'ytd',
  label: 'YTD (experimental)',
  ext: 'ytd',
  ready: false,
  export: async () => {
    throw new Error('YTD rebuild is not implemented yet — export DDS and drop it into the YTD with CodeWalker/OpenIV.');
  },
};

export const EXPORTERS: LiveryExporter[] = [pngExporter, ddsExporter, ytdExporter];

export function getExporter(id: string): LiveryExporter | undefined {
  return EXPORTERS.find((e) => e.id === id);
}

/** Trigger a browser download for an export result. */
export function downloadResult(result: ExportResult) {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
