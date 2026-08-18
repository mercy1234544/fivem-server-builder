// Vehicle Studio — resource scanner, vehicle classifier, and cross-file
// diagnostics. Read-only analysis (no edits/writes here yet); reuses the
// existing VehicleResourceScanner for file grouping and extract-zip for ZIPs.
// Meta files are parsed with targeted regex (no XML lib) so nothing is
// rewritten or lost — the future editors will do surgical field edits.
import fs from 'fs';
import path from 'path';
import os from 'os';
import extractZip from 'extract-zip';
import { VehicleResourceScanner } from './VehicleResourceScanner';

export type Severity = 'error' | 'warning' | 'info';

export interface VSVehicle {
  modelName: string;
  handlingId: string | null;
  txdName: string | null;
  vehicleClass: string | null;   // raw VC_* token
  type: string;                  // friendly, e.g. "Pickup Truck"
  typeConfidence: 'High' | 'Medium' | 'Low';
  gameName: string | null;
  makeName: string | null;
  hasModel: boolean;             // a matching .yft exists
  hasHandling: boolean;          // handlingId found in handling.meta
}

export interface VSDiagnostic {
  id: string;
  severity: Severity;
  file: string;                  // repo-relative
  vehicle?: string;
  problem: string;
  detail: string;
  fix?: string;
  autoFixable: boolean;
}

export interface VSScan {
  root: string;                  // folder actually scanned
  workspacePath: string;         // stable path (folder itself, or extracted ZIP copy)
  name: string;
  isZip: boolean;
  manifest: { exists: boolean; type: 'fxmanifest' | '__resource' | 'none'; path: string | null };
  counts: { yft: number; ytd: number; meta: number; vehicles: number };
  metaFiles: { handling: string[]; vehicles: string[]; carvariations: string[]; carcols: string[]; vehiclelayouts: string[] };
  vehicles: VSVehicle[];
  diagnostics: VSDiagnostic[];
  summary: { errors: number; warnings: number; info: number };
}

// VC_* → friendly type name (reliable, from vehicles.meta vehicleClass).
const CLASS_MAP: Record<string, string> = {
  VC_COMPACT: 'Compact', VC_SEDAN: 'Sedan', VC_SUV: 'SUV', VC_COUPE: 'Coupe',
  VC_MUSCLE: 'Muscle', VC_SPORTS_CLASSIC: 'Sports Classic', VC_SPORT: 'Sports',
  VC_SUPER: 'Super', VC_MOTORCYCLE: 'Motorcycle', VC_OFF_ROAD: 'Off-Road',
  VC_INDUSTRIAL: 'Industrial', VC_UTILITY: 'Utility', VC_VAN: 'Van',
  VC_CYCLE: 'Cycle', VC_BOAT: 'Boat', VC_HELICOPTER: 'Helicopter',
  VC_PLANE: 'Plane', VC_SERVICE: 'Service', VC_EMERGENCY: 'Emergency',
  VC_MILITARY: 'Military', VC_COMMERCIAL: 'Commercial', VC_TRAIN: 'Train',
  VC_OPEN_WHEEL: 'Open Wheel',
};

export class VehicleStudio {
  private scanner = new VehicleResourceScanner();

  constructor(private userDataPath: string) {}

  /** Scan a folder or ZIP. ZIPs are extracted into a persistent workspace copy. */
  async scan(inputPath: string): Promise<VSScan> {
    const isZip = inputPath.toLowerCase().endsWith('.zip');
    let root = inputPath;
    let workspacePath = inputPath;

    if (isZip) {
      const wsRoot = path.join(this.userDataPath, 'vehicle-studio', path.basename(inputPath, '.zip') + '-' + Date.now());
      fs.mkdirSync(wsRoot, { recursive: true });
      await extractZip(inputPath, { dir: wsRoot });
      // Collapse a single top-level folder (common in GitHub/exported ZIPs).
      const entries = fs.readdirSync(wsRoot);
      root = (entries.length === 1 && fs.statSync(path.join(wsRoot, entries[0])).isDirectory())
        ? path.join(wsRoot, entries[0]) : wsRoot;
      workspacePath = root;
    }

    const rel = (p: string) => path.relative(root, p).replace(/\\/g, '/');
    const scan = this.scanner.scan(root);

    // Manifest
    const fxPath = path.join(root, 'fxmanifest.lua');
    const oldPath = path.join(root, '__resource.lua');
    const manifest = fs.existsSync(fxPath)
      ? { exists: true, type: 'fxmanifest' as const, path: fxPath }
      : fs.existsSync(oldPath)
        ? { exists: true, type: '__resource' as const, path: oldPath }
        : { exists: false, type: 'none' as const, path: null };

    // Parse handling.meta → set of handling names (upper) present.
    const handlingNames = new Set<string>();
    const handlingDupes = new Set<string>();
    for (const hp of scan.meta.handling) {
      for (const name of this.readTags(hp, 'handlingName')) {
        const u = name.toUpperCase();
        if (handlingNames.has(u)) handlingDupes.add(u);
        handlingNames.add(u);
      }
    }

    // Model base names present (lowercased .yft, minus _hi).
    const modelNames = new Set(scan.vehicles.map((v) => v.name.toLowerCase()));
    const ytdNames = new Set<string>();
    for (const v of scan.vehicles) for (const y of v.ytds) ytdNames.add(path.basename(y).toLowerCase().replace(/\.ytd$/, ''));

    // Parse vehicles.meta <Item> blocks.
    const vehicles: VSVehicle[] = [];
    const seenModels = new Set<string>();
    const modelDupes = new Set<string>();
    const diagnostics: VSDiagnostic[] = [];

    for (const vp of scan.meta.vehicles) {
      let raw = '';
      try { raw = fs.readFileSync(vp, 'utf-8'); } catch { continue; }
      const items = raw.split(/<Item[\s>]/i).slice(1);
      for (const block of items) {
        const modelName = this.firstTag(block, 'modelName');
        if (!modelName) continue;
        const handlingId = this.firstTag(block, 'handlingId');
        const txdName = this.firstTag(block, 'txdName');
        const vehicleClass = this.firstAttrOrTag(block, 'vehicleClass');
        const gameName = this.firstTag(block, 'gameName');
        const makeName = this.firstTag(block, 'vehicleMakeName');

        const ml = modelName.toLowerCase();
        if (seenModels.has(ml)) modelDupes.add(ml);
        seenModels.add(ml);

        const hasModel = modelNames.has(ml);
        const hasHandling = handlingId ? handlingNames.has(handlingId.toUpperCase()) : false;
        const type = vehicleClass && CLASS_MAP[vehicleClass] ? CLASS_MAP[vehicleClass] : 'Unknown';

        vehicles.push({
          modelName, handlingId, txdName, vehicleClass, gameName, makeName,
          type, typeConfidence: type === 'Unknown' ? 'Low' : 'High',
          hasModel, hasHandling,
        });

        // Per-vehicle diagnostics
        if (!hasModel) diagnostics.push({
          id: `missing-model-${ml}`, severity: 'error', file: rel(vp), vehicle: modelName,
          problem: `No model file for "${modelName}"`,
          detail: `vehicles.meta lists modelName "${modelName}" but no ${modelName}.yft was found in the resource.`,
          fix: 'Add the .yft model, or correct the modelName.', autoFixable: false,
        });
        if (handlingId && !hasHandling) diagnostics.push({
          id: `missing-handling-${ml}`, severity: 'error', file: rel(vp), vehicle: modelName,
          problem: `handlingId "${handlingId}" has no handling entry`,
          detail: `No <handlingName>${handlingId}</handlingName> was found in handling.meta.`,
          fix: 'Create the handling entry or fix the handlingId.', autoFixable: false,
        });
        if (txdName && !ytdNames.has(txdName.toLowerCase()) && !modelNames.has(txdName.toLowerCase())) diagnostics.push({
          id: `missing-txd-${ml}`, severity: 'warning', file: rel(vp), vehicle: modelName,
          problem: `Texture dictionary "${txdName}" not found`,
          detail: `No ${txdName}.ytd found. This is only a problem if textures aren't embedded in the model.`,
          autoFixable: false,
        });
      }
    }

    // Resource-level diagnostics
    if (!manifest.exists) diagnostics.push({
      id: 'no-manifest', severity: 'error', file: '(resource root)',
      problem: 'No fxmanifest.lua', detail: 'The resource has no fxmanifest.lua (or __resource.lua) and will not load in FiveM.',
      fix: 'Generate an fxmanifest.lua that registers the model and meta files.', autoFixable: true,
    });
    else if (manifest.type === '__resource') diagnostics.push({
      id: 'old-manifest', severity: 'warning', file: '__resource.lua',
      problem: 'Uses the deprecated __resource.lua', detail: '__resource.lua is deprecated; modern FiveM expects fxmanifest.lua.',
      fix: 'Migrate to fxmanifest.lua.', autoFixable: true,
    });
    if (scan.meta.vehicles.length === 0 && scan.vehicles.length > 0) diagnostics.push({
      id: 'no-vehicles-meta', severity: 'warning', file: '(resource root)',
      problem: 'No vehicles.meta', detail: 'Model files were found but there is no vehicles.meta, so the game has no spawn/definition data.',
      autoFixable: false,
    });
    for (const d of modelDupes) diagnostics.push({
      id: `dup-model-${d}`, severity: 'error', file: 'vehicles.meta', vehicle: d,
      problem: `Duplicate model "${d}"`, detail: `"${d}" is defined more than once in vehicles.meta — this causes conflicts.`, autoFixable: false,
    });
    for (const d of handlingDupes) diagnostics.push({
      id: `dup-handling-${d}`, severity: 'warning', file: 'handling.meta',
      problem: `Duplicate handling "${d}"`, detail: `handlingName "${d}" appears more than once in handling.meta.`, autoFixable: false,
    });
    // Models with no vehicles.meta entry
    for (const v of scan.vehicles) {
      if (!seenModels.has(v.name.toLowerCase()) && scan.meta.vehicles.length > 0) diagnostics.push({
        id: `orphan-model-${v.name.toLowerCase()}`, severity: 'info', file: rel(v.yft || v.hiYft || v.dir),
        problem: `Model "${v.name}" has no vehicles.meta entry`,
        detail: `${v.name}.yft exists but isn't referenced in vehicles.meta.`, autoFixable: false,
      });
    }

    const summary = {
      errors: diagnostics.filter((d) => d.severity === 'error').length,
      warnings: diagnostics.filter((d) => d.severity === 'warning').length,
      info: diagnostics.filter((d) => d.severity === 'info').length,
    };

    return {
      root, workspacePath, name: path.basename(inputPath).replace(/\.zip$/i, ''), isZip,
      manifest,
      counts: {
        yft: scan.vehicles.reduce((n, v) => n + (v.yft ? 1 : 0) + (v.hiYft ? 1 : 0), 0),
        ytd: new Set(scan.vehicles.flatMap((v) => v.ytds)).size,
        meta: scan.meta.handling.length + scan.meta.vehicles.length + scan.meta.carvariations.length + scan.meta.vehiclelayouts.length,
        vehicles: vehicles.length || scan.vehicles.length,
      },
      metaFiles: {
        handling: scan.meta.handling.map(rel), vehicles: scan.meta.vehicles.map(rel),
        carvariations: scan.meta.carvariations.map(rel), carcols: [],
        vehiclelayouts: scan.meta.vehiclelayouts.map(rel),
      },
      vehicles,
      diagnostics,
      summary,
    };
  }

  // ── tiny, safe meta readers (read-only) ──────────────────────────────────────
  private readTags(file: string, tag: string): string[] {
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const re = new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'gi');
      const out: string[] = []; let m;
      while ((m = re.exec(raw)) !== null) out.push(m[1].trim());
      return out;
    } catch { return []; }
  }
  private firstTag(block: string, tag: string): string | null {
    const m = block.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, 'i'));
    return m ? m[1].trim() : null;
  }
  // vehicleClass can be <vehicleClass>VC_X</vehicleClass> or <vehicleClass value="VC_X"/>
  private firstAttrOrTag(block: string, tag: string): string | null {
    const t = this.firstTag(block, tag);
    if (t) return t;
    const m = block.match(new RegExp(`<${tag}[^>]*\\bvalue="([^"]+)"`, 'i'));
    return m ? m[1].trim() : null;
  }
}
