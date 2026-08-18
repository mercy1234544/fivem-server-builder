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

export interface VSHandlingField {
  name: string;
  kind: 'scalar' | 'int' | 'vector' | 'text';
  value?: string;
  x?: string; y?: string; z?: string;
  editable: boolean;
}
export interface VSHandlingChange { name: string; axis?: 'x' | 'y' | 'z'; value: string; }

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
  category: 'Resource' | 'Manifest' | 'Vehicle' | 'Handling' | 'Metadata' | 'Files';
  file: string;                  // repo-relative
  line?: number;
  vehicle?: string;
  problem: string;
  detail: string;
  why?: string;                  // plain-English "why is this broken?"
  fix?: string;
  autoFixable: boolean;
  fixKind?: 'generate-manifest' | 'register-handling';  // dispatch for Fix-All
  handlingRef?: string;          // handlingId this is about (enables Find Cause / repair)
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

// Never copy dev cruft or Vehicle Studio's own backup folders into a workspace
// copy or an export/install (backups are internal, not part of the resource).
const SKIP_COPY = new Set(['node_modules', '.git', '.vscode', '.vehicle-studio-backups']);

// ── Smart Tuning: data-driven driving profiles ────────────────────────────────
// Each profile computes ABSOLUTE target values (deterministic, some scaled by
// the vehicle's real mass) — never random bumps. Only fields that already exist
// in the vehicle are changed (surgical). Values are tuning targets, not physics.
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

// Similarity 0..100 (Levenshtein-based) — used to suggest close handling matches.
function similarity(a: string, b: string): number {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return 100;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return Math.round((1 - d[m][n] / Math.max(m, n)) * 100);
}

// A complete, valid GTA-style handling entry used as a starting point when a
// vehicle is missing its handling (§43). Real values, fully tunable afterward.
const HANDLING_TEMPLATE = (name: string) => `    <Item type="CHandlingData">
      <handlingName>${name}</handlingName>
      <fMass value="1400.000000" />
      <fInitialDragCoeff value="8.500000" />
      <fPercentSubmerged value="85.000000" />
      <vecCentreOfMassOffset x="0.000000" y="0.000000" z="0.000000" />
      <vecInertiaMultiplier x="1.000000" y="1.000000" z="1.000000" />
      <fDriveBiasFront value="0.000000" />
      <nInitialDriveGears value="6" />
      <fInitialDriveForce value="0.330000" />
      <fDriveInertia value="1.000000" />
      <fClutchChangeRateScaleUpShift value="2.000000" />
      <fClutchChangeRateScaleDownShift value="2.000000" />
      <fInitialDriveMaxFlatVel value="150.000000" />
      <fBrakeForce value="1.000000" />
      <fBrakeBiasFront value="0.500000" />
      <fHandBrakeForce value="0.800000" />
      <fSteeringLock value="40.000000" />
      <fTractionCurveMax value="2.200000" />
      <fTractionCurveMin value="1.800000" />
      <fTractionCurveLateral value="22.500000" />
      <fTractionSpringDeltaMax value="0.150000" />
      <fLowSpeedTractionLossMult value="1.000000" />
      <fCamberStiffnesss value="0.000000" />
      <fTractionBiasFront value="0.480000" />
      <fTractionLossMult value="1.000000" />
      <fSuspensionForce value="2.200000" />
      <fSuspensionCompDamp value="1.500000" />
      <fSuspensionReboundDamp value="2.200000" />
      <fSuspensionUpperLimit value="0.100000" />
      <fSuspensionLowerLimit value="-0.100000" />
      <fSuspensionRaise value="0.000000" />
      <fSuspensionBiasFront value="0.500000" />
      <fAntiRollBarForce value="1.000000" />
      <fAntiRollBarBiasFront value="0.500000" />
      <fRollCentreHeightFront value="0.300000" />
      <fRollCentreHeightRear value="0.300000" />
      <fCollisionDamageMult value="1.000000" />
      <fWeaponDamageMult value="1.000000" />
      <fDeformationDamageMult value="1.000000" />
      <fEngineDamageMult value="1.500000" />
      <fPetrolTankVolume value="65.000000" />
      <fOilVolume value="5.000000" />
      <nMonetaryValue value="100000" />
      <strModelFlags>440010</strModelFlags>
      <strHandlingFlags>0</strHandlingFlags>
      <strDamageFlags>0</strDamageFlags>
      <SubHandlingData>
        <Item type="NULL" />
        <Item type="NULL" />
        <Item type="NULL" />
      </SubHandlingData>
    </Item>`;
interface TuneProfile { id: string; name: string; desc: string; compute: (f: Record<string, number>) => Record<string, number>; }
const PROFILES: TuneProfile[] = [
  { id: 'street', name: 'Street', desc: 'Balanced, grippy daily setup.', compute: (f) => ({
    fInitialDriveForce: clamp((f.fInitialDriveForce ?? 0.3) + 0.02, 0.26, 0.42), fTractionCurveMax: 2.0, fBrakeForce: 0.9, fSteeringLock: 42 }) },
  { id: 'sport', name: 'Sport', desc: 'Quicker, sharper, more grip.', compute: (f) => ({
    fInitialDriveForce: 0.34, fTractionCurveMax: 2.25, fBrakeForce: 1.0, fSteeringLock: 44, nInitialDriveGears: Math.max(f.nInitialDriveGears ?? 5, 6) }) },
  { id: 'track', name: 'Track', desc: 'Max grip + braking, stiffer.', compute: (f) => ({
    fInitialDriveForce: 0.37, fTractionCurveMax: 2.6, fBrakeForce: 1.2, fSteeringLock: 45, fTractionBiasFront: 0.49, fSuspensionForce: clamp((f.fSuspensionForce ?? 2.2) * 1.1, 1.5, 5) }) },
  { id: 'grip', name: 'Grip', desc: 'Glued to the road.', compute: () => ({
    fTractionCurveMax: 2.8, fLowSpeedTractionLossMult: 0.8, fBrakeForce: 1.1, fSteeringLock: 44 }) },
  { id: 'drift', name: 'Drift', desc: 'Loose rear, RWD, big lock.', compute: () => ({
    fTractionCurveMax: 1.5, fTractionBiasFront: 0.55, fDriveBiasFront: 0, fBrakeForce: 0.9, fSteeringLock: 50 }) },
  { id: 'drag', name: 'Drag', desc: 'Straight-line launch.', compute: () => ({
    fInitialDriveForce: 0.42, nInitialDriveGears: 4, fTractionCurveMax: 2.4, fBrakeForce: 0.8, fSteeringLock: 30 }) },
  { id: 'offroad', name: 'Off-Road', desc: 'Suspension + traction focus.', compute: (f) => ({
    fTractionCurveMax: 1.7, fSuspensionForce: clamp((f.fSuspensionForce ?? 2.2) * 1.15, 1.5, 6), fBrakeForce: 0.95, fDriveBiasFront: 0.5, fSteeringLock: 40 }) },
  { id: 'heavy', name: 'Heavy Duty', desc: 'Tuned around a heavy chassis.', compute: (f) => ({
    fInitialDriveForce: clamp(0.18 + (f.fMass ?? 2000) / 20000, 0.22, 0.34), fTractionCurveMax: 1.6,
    fBrakeForce: clamp(0.7 + (f.fMass ?? 2000) / 30000, 0.7, 1.1), nInitialDriveGears: Math.max(f.nInitialDriveGears ?? 5, 6) }) },
];
const REC: Record<string, { r: string; a: string[] }> = {
  Super: { r: 'sport', a: ['street', 'track', 'grip', 'drag', 'drift'] },
  Sports: { r: 'street', a: ['sport', 'track', 'grip', 'drag', 'drift'] },
  'Sports Classic': { r: 'street', a: ['sport', 'track', 'drift'] },
  Muscle: { r: 'street', a: ['drag', 'track', 'drift'] },
  Coupe: { r: 'street', a: ['sport', 'track'] },
  Sedan: { r: 'street', a: ['sport', 'track'] },
  Compact: { r: 'street', a: ['sport'] },
  SUV: { r: 'offroad', a: ['street', 'sport'] },
  'Off-Road': { r: 'offroad', a: ['sport', 'street'] },
  Van: { r: 'heavy', a: ['street', 'offroad'] },
  Commercial: { r: 'heavy', a: ['offroad'] },
  Industrial: { r: 'heavy', a: ['offroad'] },
  Utility: { r: 'heavy', a: ['offroad', 'street'] },
  Service: { r: 'heavy', a: ['street'] },
  Emergency: { r: 'sport', a: ['street', 'track'] },
  Motorcycle: { r: 'street', a: ['sport', 'drag'] },
};

export class VehicleStudio {
  private scanner = new VehicleResourceScanner();

  constructor(private userDataPath: string) {}

  private wsDir(inputPath: string): string {
    const slug = path.basename(inputPath).replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.userDataPath, 'vehicle-studio', `${slug}-${Date.now()}`);
  }

  /** Recursively copy a directory (skips node_modules/.git). */
  private copyDir(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (e.isDirectory() && SKIP_COPY.has(e.name.toLowerCase())) continue;
      const s = path.join(src, e.name), d = path.join(dest, e.name);
      if (e.isDirectory()) this.copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  }

  /**
   * Scan a folder or ZIP. ZIPs always extract into a workspace copy. Folders
   * are scanned in place unless `copy` is set (import creates a safe workspace
   * copy so the original is never modified; re-opening a workspace passes false).
   */
  async scan(inputPath: string, copy = false): Promise<VSScan> {
    const isZip = inputPath.toLowerCase().endsWith('.zip');
    let root = inputPath;
    let workspacePath = inputPath;

    if (isZip) {
      const wsRoot = this.wsDir(inputPath);
      fs.mkdirSync(wsRoot, { recursive: true });
      await extractZip(inputPath, { dir: wsRoot });
      // Collapse a single top-level folder (common in GitHub/exported ZIPs).
      const entries = fs.readdirSync(wsRoot);
      root = (entries.length === 1 && fs.statSync(path.join(wsRoot, entries[0])).isDirectory())
        ? path.join(wsRoot, entries[0]) : wsRoot;
      workspacePath = root;
    } else if (copy) {
      const wsRoot = this.wsDir(inputPath);
      this.copyDir(inputPath, wsRoot);
      root = wsRoot;
      workspacePath = wsRoot;
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
          id: `missing-model-${ml}`, severity: 'error', category: 'Vehicle', file: rel(vp), vehicle: modelName,
          problem: `No model file for "${modelName}"`,
          detail: `vehicles.meta lists modelName "${modelName}" but no ${modelName}.yft was found in the resource.`,
          why: `vehicles.meta tells FiveM to load a model called "${modelName}", but there's no ${modelName}.yft file in the resource, so the vehicle can't spawn.`,
          fix: 'Add the .yft model, or correct the modelName.', autoFixable: false,
        });
        if (handlingId && !hasHandling) diagnostics.push({
          id: `missing-handling-${ml}`, severity: 'error', category: 'Handling', file: rel(vp), vehicle: modelName, handlingRef: handlingId,
          problem: `Handling "${handlingId}" not found`,
          detail: `vehicles.meta says "${modelName}" uses handling "${handlingId}", but no matching handling entry was found. Use "Find cause" to trace it.`,
          why: `vehicles.meta tells FiveM this vehicle uses handling "${handlingId}". Vehicle Studio searched the resource but couldn't find a handling entry named "${handlingId}". The vehicle may load with wrong handling or fail to load.`,
          fix: 'Find a matching handling, create one, change the handlingId, or register handling.meta.', autoFixable: false,
        });
        if (txdName && !ytdNames.has(txdName.toLowerCase()) && !modelNames.has(txdName.toLowerCase())) diagnostics.push({
          id: `missing-txd-${ml}`, severity: 'warning', category: 'Vehicle', file: rel(vp), vehicle: modelName,
          problem: `Texture dictionary "${txdName}" not found`,
          detail: `No ${txdName}.ytd found. This is only a problem if textures aren't embedded in the model.`,
          why: `vehicles.meta references a texture dictionary "${txdName}" (${txdName}.ytd). It wasn't found — this is fine if the textures are embedded in the .yft, otherwise the vehicle may appear untextured.`,
          autoFixable: false,
        });
      }
    }

    // Resource-level diagnostics
    if (!manifest.exists) diagnostics.push({
      id: 'no-manifest', severity: 'error', category: 'Resource', file: '(resource root)',
      problem: 'No fxmanifest.lua', detail: 'The resource has no fxmanifest.lua (or __resource.lua) and will not load in FiveM.',
      why: 'FiveM reads fxmanifest.lua to know what a resource contains. Without it, the resource is ignored entirely.',
      fix: 'Generate an fxmanifest.lua that registers the model and meta files.', autoFixable: true, fixKind: 'generate-manifest',
    });
    else if (manifest.type === '__resource') diagnostics.push({
      id: 'old-manifest', severity: 'warning', category: 'Manifest', file: '__resource.lua',
      problem: 'Uses the deprecated __resource.lua', detail: '__resource.lua is deprecated; modern FiveM expects fxmanifest.lua.',
      why: 'Older resources used __resource.lua. Modern FiveM servers expect fxmanifest.lua; the old name still works but is deprecated.',
      fix: 'Generate a modern fxmanifest.lua.', autoFixable: true, fixKind: 'generate-manifest',
    });
    // handling.meta present but not registered in the manifest (§3)
    const handlingRegistered = manifest.exists && manifest.path
      ? (() => { try { return /data_file\s+['"]HANDLING_FILE['"]/i.test(fs.readFileSync(manifest.path!, 'utf-8')); } catch { return true; } })()
      : true;
    if (scan.meta.handling.length > 0 && !handlingRegistered) diagnostics.push({
      id: 'handling-not-registered', severity: 'warning', category: 'Manifest',
      file: manifest.type === 'fxmanifest' ? 'fxmanifest.lua' : '__resource.lua',
      problem: 'handling.meta is not registered in the manifest',
      detail: `handling.meta exists but the manifest has no data_file 'HANDLING_FILE' line, so FiveM ignores the custom handling.`,
      why: `A handling.meta file only takes effect if the manifest registers it with data_file 'HANDLING_FILE'. Without that line, the game loads the vehicle with default handling.`,
      fix: `Add: data_file 'HANDLING_FILE' '${path.relative(root, scan.meta.handling[0]).replace(/\\/g, '/')}'`,
      autoFixable: true, fixKind: 'register-handling',
    });
    if (scan.meta.vehicles.length === 0 && scan.vehicles.length > 0) diagnostics.push({
      id: 'no-vehicles-meta', severity: 'warning', category: 'Metadata', file: '(resource root)',
      problem: 'No vehicles.meta', detail: 'Model files were found but there is no vehicles.meta, so the game has no spawn/definition data.',
      why: 'vehicles.meta defines the spawn name, class, handling link and more. Without it the model files exist but the game has no vehicle to spawn.',
      autoFixable: false,
    });
    for (const d of modelDupes) diagnostics.push({
      id: `dup-model-${d}`, severity: 'error', category: 'Vehicle', file: 'vehicles.meta', vehicle: d,
      problem: `Duplicate model "${d}"`, detail: `"${d}" is defined more than once in vehicles.meta — this causes conflicts.`, autoFixable: false,
    });
    for (const d of handlingDupes) diagnostics.push({
      id: `dup-handling-${d}`, severity: 'warning', category: 'Handling', file: 'handling.meta',
      problem: `Duplicate handling "${d}"`, detail: `handlingName "${d}" appears more than once in handling.meta.`, autoFixable: false,
    });
    // A few genuinely useful info items (not noise, per §39)
    if (vehicles.length > 0) diagnostics.push({
      id: 'info-vehicle-count', severity: 'info', category: 'Vehicle', file: 'vehicles.meta',
      problem: `Resource contains ${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}`,
      detail: vehicles.map((v) => v.modelName).join(', '), autoFixable: false,
    });
    if (handlingNames.size > 0) diagnostics.push({
      id: 'info-handling-count', severity: 'info', category: 'Handling', file: 'handling.meta',
      problem: `handling.meta defines ${handlingNames.size} handling entr${handlingNames.size !== 1 ? 'ies' : 'y'}`,
      detail: Array.from(handlingNames).join(', '), autoFixable: false,
    });

    // Models with no vehicles.meta entry
    for (const v of scan.vehicles) {
      if (!seenModels.has(v.name.toLowerCase()) && scan.meta.vehicles.length > 0) diagnostics.push({
        id: `orphan-model-${v.name.toLowerCase()}`, severity: 'info', category: 'Files', file: rel(v.yft || v.hiYft || v.dir),
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

  // ══════════════════ handling.meta editing (surgical, backed up) ════════════════

  /** Locate the balanced <Item ...>…</Item> block of a handling entry by name. */
  private locateHandlingBlock(content: string, handlingId: string): { start: number; end: number } | null {
    const nameRe = new RegExp(`<handlingName>\\s*${handlingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</handlingName>`, 'i');
    const nameMatch = nameRe.exec(content);
    if (!nameMatch) return null;
    // nearest <Item before the name
    const start = content.lastIndexOf('<Item', nameMatch.index);
    if (start < 0) return null;
    // Balanced scan for the matching </Item>. Crucially, self-closing items —
    // e.g. <Item type="NULL" /> inside <SubHandlingData> — must NOT change depth,
    // otherwise the outer handling <Item> never balances (this was the cause of
    // "handling not found" on real vehicles).
    const tagRe = /<Item\b[^>]*>|<\/Item>/gi;
    tagRe.lastIndex = start;
    let depth = 0, m: RegExpExecArray | null;
    while ((m = tagRe.exec(content)) !== null) {
      const t = m[0];
      if (t.startsWith('</')) { depth--; if (depth === 0) return { start, end: m.index + t.length }; }
      else if (t.endsWith('/>')) { /* self-closing — no depth change */ }
      else depth++;
    }
    return null;
  }

  private firstHandlingFile(root: string, handlingId: string): string | null {
    for (const f of this.scanner.scan(root).meta.handling) {
      try { if (this.locateHandlingBlock(fs.readFileSync(f, 'utf-8'), handlingId)) return f; } catch {}
    }
    return null;
  }

  /** Read the editable fields of a handling entry. */
  readHandling(root: string, handlingId: string): { ok: boolean; error?: string; filePath?: string; fields?: VSHandlingField[] } {
    const file = this.firstHandlingFile(root, handlingId);
    if (!file) return { ok: false, error: `Handling "${handlingId}" not found in any handling.meta` };
    const content = fs.readFileSync(file, 'utf-8');
    const loc = this.locateHandlingBlock(content, handlingId)!;
    const block = content.slice(loc.start, loc.end);

    const fields: VSHandlingField[] = [];
    const counts = new Map<string, number>();
    const bump = (n: string) => counts.set(n, (counts.get(n) || 0) + 1);

    // scalar/int: <fMass value="1800.0" /> or <nInitialDriveGears value="6" />
    for (const m of block.matchAll(/<([fn][A-Za-z0-9_]+)\s+value="([^"]*)"\s*\/?>/g)) { bump(m[1]); }
    for (const m of block.matchAll(/<([fn][A-Za-z0-9_]+)\s+value="([^"]*)"\s*\/?>/g)) {
      if ((counts.get(m[1]) || 0) !== 1) continue; // only uniquely-addressable fields are editable
      fields.push({ name: m[1], kind: m[1].startsWith('n') ? 'int' : 'scalar', value: m[2], editable: true });
    }
    // vectors: <vecCentreOfMassOffset x="0" y="0" z="0" />
    const vcounts = new Map<string, number>();
    for (const m of block.matchAll(/<(vec[A-Za-z0-9_]+)\s+x="([^"]*)"\s+y="([^"]*)"\s+z="([^"]*)"\s*\/?>/g)) vcounts.set(m[1], (vcounts.get(m[1]) || 0) + 1);
    for (const m of block.matchAll(/<(vec[A-Za-z0-9_]+)\s+x="([^"]*)"\s+y="([^"]*)"\s+z="([^"]*)"\s*\/?>/g)) {
      if ((vcounts.get(m[1]) || 0) !== 1) continue;
      fields.push({ name: m[1], kind: 'vector', x: m[2], y: m[3], z: m[4], editable: true });
    }
    return { ok: true, filePath: file, fields };
  }

  private backup(file: string): string {
    const dir = path.join(path.dirname(file), '.vehicle-studio-backups');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${path.basename(file)}.${Date.now()}.bak`);
    fs.copyFileSync(file, dest);
    return dest;
  }

  /** Apply field changes to a handling entry surgically (only the targeted
   *  attribute is rewritten; everything else in the file is preserved). */
  writeHandling(root: string, handlingId: string, changes: VSHandlingChange[]): { ok: boolean; error?: string; backup?: string; applied?: number } {
    const file = this.firstHandlingFile(root, handlingId);
    if (!file) return { ok: false, error: `Handling "${handlingId}" not found` };
    let content = fs.readFileSync(file, 'utf-8');
    const loc = this.locateHandlingBlock(content, handlingId)!;
    let block = content.slice(loc.start, loc.end);
    let applied = 0;

    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // safe in a RegExp source
    const rep = (s: string) => s.replace(/\$/g, '$$$$');                    // safe in a String.replace replacement
    for (const c of changes) {
      const name = esc(c.name);
      // Only touch a field that appears exactly once in this handling block —
      // never risk rewriting the wrong occurrence (e.g. a sub-handling field).
      if ((block.match(new RegExp(`<${name}\\b`, 'g')) || []).length !== 1) continue;
      const re = c.axis
        ? new RegExp(`(<${name}\\s+[^>]*\\b${c.axis}=")[^"]*(")`)
        : new RegExp(`(<${name}\\s+value=")[^"]*(")`);
      if (re.test(block)) { block = block.replace(re, `$1${rep(c.value)}$2`); applied++; }
    }
    if (applied === 0) return { ok: false, error: 'No matching fields to change' };

    const backup = this.backup(file);
    content = content.slice(0, loc.start) + block + content.slice(loc.end);
    fs.writeFileSync(file, content, 'utf-8');
    return { ok: true, backup, applied };
  }

  /** Restore the most recent backup of a handling file (undo last save). */
  undoHandling(root: string, handlingId: string): { ok: boolean; error?: string } {
    const file = this.firstHandlingFile(root, handlingId);
    if (!file) return { ok: false, error: 'Handling file not found' };
    const dir = path.join(path.dirname(file), '.vehicle-studio-backups');
    if (!fs.existsSync(dir)) return { ok: false, error: 'No backups to restore' };
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith(path.basename(file))).sort();
    if (backups.length === 0) return { ok: false, error: 'No backups to restore' };
    const latest = path.join(dir, backups[backups.length - 1]);
    fs.copyFileSync(latest, file);
    fs.unlinkSync(latest);
    return { ok: true };
  }

  /** Generate a correct fxmanifest.lua registering the resource's meta + stream. */
  generateManifest(root: string): { ok: boolean; error?: string; path?: string } {
    const scan = this.scanner.scan(root);
    const relFrom = (p: string) => path.relative(root, p).replace(/\\/g, '/');
    const dataFiles: { type: string; file: string }[] = [];
    const files = new Set<string>();
    const TYPE: Record<string, string> = {
      handling: 'HANDLING_FILE', vehicles: 'VEHICLE_METADATA_FILE',
      carvariations: 'VEHICLE_VARIATION_FILE', vehiclelayouts: 'VEHICLE_LAYOUTS_FILE',
    };
    for (const key of Object.keys(TYPE) as (keyof typeof scan.meta)[]) {
      for (const f of (scan.meta as any)[key] as string[]) { const r = relFrom(f); files.add(r); dataFiles.push({ type: TYPE[key], file: r }); }
    }
    // carcols.meta isn't grouped by the scanner — detect it directly.
    for (const f of ['carcols.meta', 'data/carcols.meta'].map((p) => path.join(root, p))) {
      if (fs.existsSync(f)) { const r = relFrom(f); files.add(r); dataFiles.push({ type: 'CARCOLS_FILE', file: r }); }
    }
    if (dataFiles.length === 0) return { ok: false, error: 'No vehicle meta files found to register' };

    const lines = [
      `fx_version 'cerulean'`, `game 'gta5'`, ``,
      `-- Generated by Vehicle Studio`, `files {`,
      ...Array.from(files).map((f) => `    '${f}',`),
      `}`, ``,
      ...dataFiles.map((d) => `data_file '${d.type}' '${d.file}'`),
      ``,
    ];
    const dest = path.join(root, 'fxmanifest.lua');
    if (fs.existsSync(dest)) this.backup(dest);
    fs.writeFileSync(dest, lines.join('\n'), 'utf-8');
    return { ok: true, path: dest };
  }

  /** Export the workspace as a .zip. */
  async exportZip(root: string, destZip: string, resourceName: string): Promise<{ ok: boolean; error?: string; path?: string }> {
    try {
      const archiver = (await import('archiver')).default;
      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(destZip);
        const ar = archiver('zip', { zlib: { level: 9 } });
        out.on('close', () => resolve());
        ar.on('error', reject);
        ar.pipe(out);
        ar.directory(root, resourceName);
        ar.finalize();
      });
      return { ok: true, path: destZip };
    } catch (e: any) { return { ok: false, error: e?.message || 'Export failed' }; }
  }

  /** Recommended + alternative tuning presets for a vehicle type. */
  recommendPresets(type: string): { recommended: string; alternatives: string[]; profiles: { id: string; name: string; desc: string }[] } {
    const r = REC[type] || { r: 'street', a: ['sport', 'track', 'offroad'] };
    return { recommended: r.r, alternatives: r.a, profiles: PROFILES.map((p) => ({ id: p.id, name: p.name, desc: p.desc })) };
  }

  /** Preview a preset: the exact before→after field changes (only existing fields). */
  previewTune(root: string, handlingId: string, profileId: string): { ok: boolean; error?: string; name?: string; changes?: { name: string; from: string; to: string }[] } {
    const prof = PROFILES.find((p) => p.id === profileId);
    if (!prof) return { ok: false, error: 'Unknown preset' };
    const read = this.readHandling(root, handlingId);
    if (!read.ok || !read.fields) return { ok: false, error: read.error };

    const cur: Record<string, number> = {};
    const curStr: Record<string, string> = {};
    for (const fld of read.fields) if (fld.value !== undefined) { cur[fld.name] = parseFloat(fld.value); curStr[fld.name] = fld.value; }

    const targets = prof.compute(cur);
    const changes: { name: string; from: string; to: string }[] = [];
    for (const [name, target] of Object.entries(targets)) {
      const fld = read.fields.find((f) => f.name === name && f.editable);
      if (!fld || fld.value === undefined) continue;                    // don't add fields that don't exist
      const to = name.startsWith('n') ? String(Math.round(target)) : target.toFixed(6);
      if (parseFloat(fld.value).toFixed(6) === parseFloat(to).toFixed(6)) continue; // unchanged
      changes.push({ name, from: fld.value, to });
    }
    return { ok: true, name: prof.name, changes };
  }

  /** Apply a preset (preview → surgical write, with backup). */
  applyTune(root: string, handlingId: string, profileId: string): { ok: boolean; error?: string; backup?: string; applied?: number } {
    const prev = this.previewTune(root, handlingId, profileId);
    if (!prev.ok || !prev.changes) return { ok: false, error: prev.error };
    if (prev.changes.length === 0) return { ok: true, applied: 0 };
    return this.writeHandling(root, handlingId, prev.changes.map((c) => ({ name: c.name, value: c.to })));
  }

  /** Export the workspace as a plain folder into a chosen destination. */
  exportFolder(root: string, destDir: string, resourceName: string): { ok: boolean; error?: string; dest?: string } {
    try { const dest = path.join(destDir, resourceName); this.copyDir(root, dest); return { ok: true, dest }; }
    catch (e: any) { return { ok: false, error: e?.message || 'Export failed' }; }
  }

  /** Copy the workspace into a server's resources, optionally adding ensure. */
  installToServer(root: string, serverInstallPath: string, resourceName: string, addEnsure: boolean): { ok: boolean; error?: string; dest?: string } {
    try {
      const dest = path.join(serverInstallPath, 'resources', `[vehicles]`, resourceName);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) this.copyDir(dest, path.join(path.dirname(dest), `.${resourceName}.backup-${Date.now()}`));
      this.copyDir(root, dest);
      if (addEnsure) {
        const cfg = path.join(serverInstallPath, 'server.cfg');
        if (fs.existsSync(cfg)) {
          let c = fs.readFileSync(cfg, 'utf-8');
          if (!new RegExp(`^\\s*ensure\\s+${resourceName}\\s*$`, 'm').test(c)) {
            this.backup(cfg);
            c = c.trimEnd() + `\nensure ${resourceName}\n`;
            fs.writeFileSync(cfg, c, 'utf-8');
          }
        }
      }
      return { ok: true, dest };
    } catch (e: any) { return { ok: false, error: e?.message || 'Install failed' }; }
  }

  // ══════════════════ handling reference intelligence & repair ══════════════════

  /** Every handling entry in the resource (Handling Library, §45). */
  listHandlingEntries(root: string): { name: string; file: string }[] {
    const out: { name: string; file: string }[] = [];
    const rel = (p: string) => path.relative(root, p).replace(/\\/g, '/');
    for (const f of this.scanner.scan(root).meta.handling) {
      for (const name of this.readTags(f, 'handlingName')) out.push({ name, file: rel(f) });
    }
    return out;
  }

  /** Is handling.meta registered via data_file 'HANDLING_FILE' in the manifest? */
  isHandlingRegistered(root: string): boolean | null {
    const man = path.join(root, 'fxmanifest.lua');
    const old = path.join(root, '__resource.lua');
    const p = fs.existsSync(man) ? man : fs.existsSync(old) ? old : null;
    if (!p) return null;
    try { return /data_file\s+['"]HANDLING_FILE['"]/i.test(fs.readFileSync(p, 'utf-8')); }
    catch { return null; }
  }

  /** Full diagnosis of a handling reference — powers "Find Cause" & repair UI. */
  diagnoseHandling(root: string, handlingId: string): {
    handlingId: string; handlingFileExists: boolean; registeredInManifest: boolean | null;
    exactMatch: { name: string; file: string } | null; fuzzy: { name: string; file: string; similarity: number }[];
    allNames: { name: string; file: string }[];
  } {
    const all = this.listHandlingEntries(root);
    const exact = all.find((e) => e.name.toUpperCase() === handlingId.toUpperCase()) || null;
    const fuzzy = all
      .filter((e) => e.name.toUpperCase() !== handlingId.toUpperCase())
      .map((e) => ({ ...e, similarity: similarity(handlingId, e.name) }))
      .filter((e) => e.similarity >= 60)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
    return {
      handlingId,
      handlingFileExists: this.scanner.scan(root).meta.handling.length > 0,
      registeredInManifest: this.isHandlingRegistered(root),
      exactMatch: exact, fuzzy, allNames: all,
    };
  }

  /** Register handling.meta in the manifest (fix for "exists but not registered"). */
  registerHandlingInManifest(root: string): { ok: boolean; error?: string } {
    const scan = this.scanner.scan(root);
    if (scan.meta.handling.length === 0) return { ok: false, error: 'No handling.meta to register' };
    const relHandling = path.relative(root, scan.meta.handling[0]).replace(/\\/g, '/');
    const man = path.join(root, 'fxmanifest.lua');
    if (!fs.existsSync(man)) { const g = this.generateManifest(root); return g.ok ? { ok: true } : { ok: false, error: g.error }; }
    let c = fs.readFileSync(man, 'utf-8');
    if (/data_file\s+['"]HANDLING_FILE['"]/i.test(c)) return { ok: true };
    this.backup(man);
    if (!c.includes(relHandling)) c = c.trimEnd() + `\nfiles { '${relHandling}' }`;
    c = c.trimEnd() + `\ndata_file 'HANDLING_FILE' '${relHandling}'\n`;
    fs.writeFileSync(man, c, 'utf-8');
    return { ok: true };
  }

  /** Change a vehicle's handlingId in vehicles.meta (repair: point at an existing entry). */
  setVehicleHandlingId(root: string, modelName: string, newHandlingId: string): { ok: boolean; error?: string } {
    for (const vp of this.scanner.scan(root).meta.vehicles) {
      let content = fs.readFileSync(vp, 'utf-8');
      // find the <Item> block for this model
      const nameRe = new RegExp(`<modelName>\\s*${modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</modelName>`, 'i');
      const nm = nameRe.exec(content);
      if (!nm) continue;
      const start = content.lastIndexOf('<Item', nm.index);
      const endRel = content.slice(nm.index).search(/<\/Item>/i);
      if (start < 0 || endRel < 0) continue;
      const end = nm.index + endRel + '</Item>'.length;
      let block = content.slice(start, end);
      if (!/<handlingId>/i.test(block)) return { ok: false, error: 'No handlingId tag to change' };
      block = block.replace(/(<handlingId>)\s*[^<]*\s*(<\/handlingId>)/i, `$1${newHandlingId}$2`);
      this.backup(vp);
      fs.writeFileSync(vp, content.slice(0, start) + block + content.slice(end), 'utf-8');
      return { ok: true };
    }
    return { ok: false, error: `Vehicle "${modelName}" not found in vehicles.meta` };
  }

  /** Create a fresh valid handling entry (§43). Won't overwrite an existing one. */
  createHandling(root: string, handlingId: string): { ok: boolean; error?: string; file?: string } {
    const existing = this.listHandlingEntries(root).find((e) => e.name.toUpperCase() === handlingId.toUpperCase());
    if (existing) return { ok: false, error: `A handling entry "${handlingId}" already exists` };
    const scan = this.scanner.scan(root);
    let file = scan.meta.handling[0];
    if (!file) { // create data/handling.meta
      const dir = fs.existsSync(path.join(root, 'data')) ? path.join(root, 'data') : root;
      file = path.join(dir, 'handling.meta');
      fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n<CHandlingDataMgr>\n  <HandlingData>\n  </HandlingData>\n</CHandlingDataMgr>\n`, 'utf-8');
    } else this.backup(file);
    let c = fs.readFileSync(file, 'utf-8');
    const entry = '\n' + HANDLING_TEMPLATE(handlingId) + '\n';
    if (/<\/HandlingData>/i.test(c)) c = c.replace(/<\/HandlingData>/i, `${entry}  </HandlingData>`);
    else if (/<\/CHandlingDataMgr>/i.test(c)) c = c.replace(/<\/CHandlingDataMgr>/i, `${entry}</CHandlingDataMgr>`);
    else c = c.trimEnd() + entry;
    fs.writeFileSync(file, c, 'utf-8');
    // ensure it's registered
    if (this.isHandlingRegistered(root) === false) this.registerHandlingInManifest(root);
    return { ok: true, file: path.relative(root, file).replace(/\\/g, '/') };
  }

  /** Clone an existing handling entry under a new name (§44). */
  cloneHandling(root: string, sourceId: string, newId: string): { ok: boolean; error?: string } {
    if (this.listHandlingEntries(root).some((e) => e.name.toUpperCase() === newId.toUpperCase()))
      return { ok: false, error: `"${newId}" already exists` };
    const file = this.firstHandlingFile(root, sourceId);
    if (!file) return { ok: false, error: `Source handling "${sourceId}" not found` };
    let c = fs.readFileSync(file, 'utf-8');
    const loc = this.locateHandlingBlock(c, sourceId)!;
    let block = c.slice(loc.start, loc.end);
    block = block.replace(/(<handlingName>)\s*[^<]*\s*(<\/handlingName>)/i, `$1${newId}$2`);
    this.backup(file);
    fs.writeFileSync(file, c.slice(0, loc.end) + '\n' + block + c.slice(loc.end), 'utf-8');
    return { ok: true };
  }
}
