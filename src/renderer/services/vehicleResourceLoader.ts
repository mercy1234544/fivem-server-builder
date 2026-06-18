// Orchestrates the folder-first workflow: detect vehicle files, read them, and
// load real textures (and, when the native engine is ready, geometry) — with no
// manual conversion step exposed to the user.

import { parseYtdDetailed, type VehicleTexture, type YtdReport } from './rage/ytd';
import { parseYftGeometry } from './rage/yft';
import { loadVehicleGLB, type LoadedVehicle } from './glbVehicle';
import { isRSC7 } from './rage/resource';

export interface DetectedVehicle {
  name: string;
  yft: string | null;
  hiYft: string | null;
  ytds: string[];
  dir: string;
}

export type LoadStage = 'scanning' | 'reading' | 'textures' | 'geometry' | 'done';

export interface VehicleLoadResult {
  textures: VehicleTexture[];
  geometry: LoadedVehicle | null;
  geometryReason?: string;
  diagnostics: VehicleDiagnostics;
}

export interface YftDiag {
  path: string;
  fileName: string;
  isHi: boolean;
  fileSize: number;
  isRSC7: boolean;
  note: string;
}

export interface YtdDiag extends YtdReport {
  path: string;
  fileName: string;
  fileSize: number;
}

export interface VehicleDiagnostics {
  vehicle: string;
  dir: string;
  yfts: YftDiag[];
  ytds: YtdDiag[];
  materials: { available: boolean; note: string };
  summary: {
    ytdCount: number;
    totalTexturesFound: number;
    totalEditable: number;
    totalRejected: number;
  };
}

/** Decode a base64 string from the main process into an ArrayBuffer. */
function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function readFileBuffer(path: string): Promise<ArrayBuffer> {
  const b64 = await window.electronAPI.livery.readBinary(path);
  return b64ToBuffer(b64);
}

/**
 * Load everything we can for a detected vehicle. Textures come from the real YTD;
 * geometry comes from the native engine when available (GLB import remains an
 * internal fallback backend, never required of the user).
 */
function fileName(p: string) { return p.split(/[\\/]/).pop() || p; }

export async function loadVehicle(
  vehicle: DetectedVehicle,
  onStage?: (stage: LoadStage, detail?: string) => void
): Promise<VehicleLoadResult> {
  const diagnostics: VehicleDiagnostics = {
    vehicle: vehicle.name, dir: vehicle.dir, yfts: [], ytds: [],
    materials: { available: false, note: 'Material data comes from the .yft geometry engine, which is still being finalized — material→texture mapping is unavailable until then.' },
    summary: { ytdCount: vehicle.ytds.length, totalTexturesFound: 0, totalEditable: 0, totalRejected: 0 },
  };

  // 1) Textures from every YTD belonging to the vehicle — with full diagnostics.
  onStage?.('textures', 'Reading textures');
  const textures: VehicleTexture[] = [];
  for (const ytd of vehicle.ytds) {
    try {
      const buf = await readFileBuffer(ytd);
      const report = await parseYtdDetailed(buf);
      diagnostics.ytds.push({ ...report, path: ytd, fileName: fileName(ytd), fileSize: buf.byteLength });
      for (const t of report.textures) {
        if (t.decoded && t.imageData) textures.push({ name: t.name, width: t.width, height: t.height, format: t.format || 'unknown', imageData: t.imageData });
      }
    } catch (e: any) {
      diagnostics.ytds.push({
        path: ytd, fileName: fileName(ytd), fileSize: 0, isRSC7: false, inflated: false,
        method: 'none', declaredCount: 0, entriesResolved: false, textures: [],
        notes: [`Could not read file: ${e?.message || e}`],
      });
    }
  }

  // Summary counts.
  for (const y of diagnostics.ytds) {
    for (const t of y.textures) {
      diagnostics.summary.totalTexturesFound++;
      if (t.decoded) diagnostics.summary.totalEditable++; else diagnostics.summary.totalRejected++;
    }
  }

  // 2) Geometry from the native YFT engine (primary path) + yft diagnostics.
  onStage?.('geometry', 'Building vehicle preview');
  let geometry: LoadedVehicle | null = null;
  let geometryReason: string | undefined;
  const yftPaths = [vehicle.yft, vehicle.hiYft].filter(Boolean) as string[];
  for (const p of yftPaths) {
    try {
      const buf = await readFileBuffer(p);
      const bytes = new Uint8Array(buf);
      diagnostics.yfts.push({ path: p, fileName: fileName(p), isHi: /_hi\.yft$/i.test(p), fileSize: buf.byteLength, isRSC7: isRSC7(bytes), note: isRSC7(bytes) ? 'RSC7 resource detected' : 'Not an RSC7 resource' });
    } catch (e: any) {
      diagnostics.yfts.push({ path: p, fileName: fileName(p), isHi: /_hi\.yft$/i.test(p), fileSize: 0, isRSC7: false, note: `Could not read: ${e?.message || e}` });
    }
  }

  const modelPath = vehicle.hiYft || vehicle.yft;
  if (modelPath) {
    try {
      const buf = await readFileBuffer(modelPath);
      const result = await parseYftGeometry(buf);
      geometryReason = result.drawable ? undefined : result.reason;
    } catch (e: any) {
      geometryReason = e?.message || 'Could not read model file.';
    }
  } else {
    geometryReason = 'No .yft model found for this vehicle.';
  }

  onStage?.('done');
  return { textures, geometry, geometryReason, diagnostics };
}

/** Internal/advanced fallback: load geometry from a GLB the user explicitly provides. */
export async function loadGeometryFromGLB(buffer: ArrayBuffer): Promise<LoadedVehicle> {
  return loadVehicleGLB(buffer);
}
