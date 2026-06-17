// Orchestrates the folder-first workflow: detect vehicle files, read them, and
// load real textures (and, when the native engine is ready, geometry) — with no
// manual conversion step exposed to the user.

import { loadYtdTextures, type VehicleTexture } from './rage/ytd';
import { parseYftGeometry } from './rage/yft';
import { loadVehicleGLB, type LoadedVehicle } from './glbVehicle';

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
export async function loadVehicle(
  vehicle: DetectedVehicle,
  onStage?: (stage: LoadStage, detail?: string) => void
): Promise<VehicleLoadResult> {
  // 1) Textures from every YTD belonging to the vehicle.
  onStage?.('textures', 'Reading textures');
  const textures: VehicleTexture[] = [];
  for (const ytd of vehicle.ytds) {
    try {
      const buf = await readFileBuffer(ytd);
      const tex = await loadYtdTextures(buf);
      textures.push(...tex);
    } catch { /* skip unreadable dictionary */ }
  }

  // 2) Geometry from the native YFT engine (primary path).
  onStage?.('geometry', 'Building vehicle preview');
  let geometry: LoadedVehicle | null = null;
  let geometryReason: string | undefined;
  const modelPath = vehicle.hiYft || vehicle.yft;
  if (modelPath) {
    try {
      const buf = await readFileBuffer(modelPath);
      const result = await parseYftGeometry(buf);
      if (result.drawable) {
        // (Native geometry -> LoadedVehicle conversion plugs in here once the
        //  drawable decoder returns meshes.)
        geometryReason = undefined;
      } else {
        geometryReason = result.reason;
      }
    } catch (e: any) {
      geometryReason = e?.message || 'Could not read model file.';
    }
  } else {
    geometryReason = 'No .yft model found for this vehicle.';
  }

  onStage?.('done');
  return { textures, geometry, geometryReason };
}

/** Internal/advanced fallback: load geometry from a GLB the user explicitly provides. */
export async function loadGeometryFromGLB(buffer: ArrayBuffer): Promise<LoadedVehicle> {
  return loadVehicleGLB(buffer);
}
