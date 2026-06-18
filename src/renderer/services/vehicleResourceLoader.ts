// Orchestrates the folder-first workflow: detect vehicle files, read them, and
// load real textures + geometry — with no manual conversion step exposed to users.

import { parseYtdDetailed, type VehicleTexture, type YtdReport } from './rage/ytd';
import { parseYftGeometry, type YftDiagnostics } from './rage/yft';
import { buildVehicleFromDrawable, loadVehicleGLB, type LoadedVehicle } from './glbVehicle';
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
  /** Full geometry diagnostics when parse was attempted. */
  geometryDiag?: YftDiagnostics;
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
    // Geometry
    geometryDecoded: boolean;
    meshCount: number;
    vertexCount: number;
    triangleCount: number;
    shaderCount: number;
    materialCount: number;
  };
}

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function readFileBuffer(path: string): Promise<ArrayBuffer> {
  const b64 = await window.electronAPI.livery.readBinary(path);
  return b64ToBuffer(b64);
}

function fileName(p: string) { return p.split(/[\\/]/).pop() || p; }

export async function loadVehicle(
  vehicle: DetectedVehicle,
  onStage?: (stage: LoadStage, detail?: string) => void
): Promise<VehicleLoadResult> {
  const diagnostics: VehicleDiagnostics = {
    vehicle: vehicle.name,
    dir: vehicle.dir,
    yfts: [],
    ytds: [],
    materials: { available: false, note: '' },
    summary: {
      ytdCount: vehicle.ytds.length,
      totalTexturesFound: 0, totalEditable: 0, totalRejected: 0,
      geometryDecoded: false, meshCount: 0, vertexCount: 0,
      triangleCount: 0, shaderCount: 0, materialCount: 0,
    },
  };

  // ── 1) Textures from every YTD ──────────────────────────────────────────────
  onStage?.('textures', 'Reading textures');
  const textures: VehicleTexture[] = [];

  for (const ytd of vehicle.ytds) {
    try {
      const buf    = await readFileBuffer(ytd);
      const report = await parseYtdDetailed(buf);
      diagnostics.ytds.push({ ...report, path: ytd, fileName: fileName(ytd), fileSize: buf.byteLength });
      for (const t of report.textures) {
        if (t.decoded && t.imageData)
          textures.push({ name: t.name, width: t.width, height: t.height, format: t.format || 'unknown', imageData: t.imageData });
      }
    } catch (e: any) {
      diagnostics.ytds.push({
        path: ytd, fileName: fileName(ytd), fileSize: 0,
        isRSC7: false, inflated: false, method: 'none',
        declaredCount: 0, entriesResolved: false, textures: [],
        notes: [`Could not read: ${e?.message || e}`],
      });
    }
  }

  for (const y of diagnostics.ytds) {
    for (const t of y.textures) {
      diagnostics.summary.totalTexturesFound++;
      if (t.decoded) diagnostics.summary.totalEditable++;
      else           diagnostics.summary.totalRejected++;
    }
  }

  // Build name → ImageData map for texture application to the model.
  const ytdTextureMap = new Map<string, ImageData>(
    textures.map((t) => [t.name, t.imageData])
  );

  // ── 2) YFT file scanning (diagnostics even for non-parsed) ──────────────────
  const yftPaths = [vehicle.yft, vehicle.hiYft].filter(Boolean) as string[];
  for (const p of yftPaths) {
    try {
      const buf   = await readFileBuffer(p);
      const bytes = new Uint8Array(buf);
      diagnostics.yfts.push({
        path: p, fileName: fileName(p),
        isHi: /_hi\.yft$/i.test(p),
        fileSize: buf.byteLength,
        isRSC7: isRSC7(bytes),
        note: isRSC7(bytes) ? 'RSC7 resource detected' : 'Not RSC7',
      });
    } catch (e: any) {
      diagnostics.yfts.push({
        path: p, fileName: fileName(p), isHi: /_hi\.yft$/i.test(p),
        fileSize: 0, isRSC7: false, note: `Read failed: ${e?.message || e}`,
      });
    }
  }

  // ── 3) Geometry from native YFT engine ─────────────────────────────────────
  onStage?.('geometry', 'Building vehicle preview');
  let geometry: LoadedVehicle | null = null;
  let geometryReason: string | undefined;

  // Prefer the hi-poly .yft for the preview if present, otherwise standard.
  const modelPath = vehicle.hiYft || vehicle.yft;
  if (modelPath) {
    try {
      const buf    = await readFileBuffer(modelPath);
      const result = await parseYftGeometry(buf);

      // Attach geometry diagnostics to the YFT entry.
      const yftEntry = diagnostics.yfts.find((y) => y.path === modelPath);
      if (yftEntry) yftEntry.geometryDiag = result.diagnostics;

      if (result.drawable) {
        geometry = buildVehicleFromDrawable(result.drawable, ytdTextureMap);

        diagnostics.summary.geometryDecoded = true;
        diagnostics.summary.meshCount       = geometry.meshes.length;
        diagnostics.summary.materialCount   = geometry.slots.length;
        diagnostics.summary.shaderCount     = result.drawable.shaders.length;
        diagnostics.summary.vertexCount     = result.diagnostics.totalVertices;
        diagnostics.summary.triangleCount   = result.diagnostics.totalTriangles;

        diagnostics.materials = {
          available: true,
          note: `${geometry.slots.length} material slots from ${result.drawable.shaders.length} shaders.`,
        };
      } else {
        geometryReason = result.reason;
        diagnostics.materials.note =
          `YFT parse returned no drawable: ${result.reason ?? 'unknown'}`;
      }
    } catch (e: any) {
      geometryReason = e?.message || 'Geometry load threw an exception.';
      diagnostics.materials.note = geometryReason ?? '';
    }
  } else {
    geometryReason = 'No .yft model found for this vehicle.';
    diagnostics.materials.note = 'No YFT file found.';
  }

  onStage?.('done');
  return { textures, geometry, geometryReason, diagnostics };
}

/** Internal: load geometry from a user-provided GLB (never exposed in the UI). */
export async function loadGeometryFromGLB(buffer: ArrayBuffer): Promise<LoadedVehicle> {
  return loadVehicleGLB(buffer);
}
