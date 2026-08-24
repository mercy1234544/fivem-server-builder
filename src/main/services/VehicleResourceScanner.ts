import fs from 'fs';
import path from 'path';

export interface DetectedVehicle {
  /** Base model name, e.g. "police3". */
  name: string;
  /** Absolute path to the main .yft (collision/model), if found. */
  yft: string | null;
  /** Absolute path to the _hi.yft (high-detail), if found. */
  hiYft: string | null;
  /** Absolute paths to texture dictionaries (.ytd) belonging to this vehicle. */
  ytds: string[];
  /** Directory that holds the model files. */
  dir: string;
}

export interface VehicleScanResult {
  root: string;
  vehicles: DetectedVehicle[];
  meta: {
    handling: string[];
    carvariations: string[];
    vehiclelayouts: string[];
    vehicles: string[];
  };
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', 'cache', '.vehicle-studio-original', '.vehicle-studio-backups']);
const MAX_DEPTH = 8;

export class VehicleResourceScanner {
  /** Recursively scan a resource folder and group files into vehicles. */
  scan(root: string): VehicleScanResult {
    const yftFiles: string[] = [];
    const ytdFiles: string[] = [];
    const meta = { handling: [] as string[], carvariations: [] as string[], vehiclelayouts: [] as string[], vehicles: [] as string[] };

    const walk = (dir: string, depth: number) => {
      if (depth > MAX_DEPTH) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name.toLowerCase())) walk(full, depth + 1);
          continue;
        }
        const lower = e.name.toLowerCase();
        if (lower.endsWith('.yft')) yftFiles.push(full);
        else if (lower.endsWith('.ytd')) ytdFiles.push(full);
        else if (lower === 'handling.meta') meta.handling.push(full);
        else if (lower === 'carvariations.meta') meta.carvariations.push(full);
        else if (lower === 'vehiclelayouts.meta') meta.vehiclelayouts.push(full);
        else if (lower === 'vehicles.meta') meta.vehicles.push(full);
      }
    };
    walk(root, 0);

    // Group YFTs by base name (strip _hi).
    const byBase = new Map<string, DetectedVehicle>();
    const baseOf = (file: string) => path.basename(file).replace(/\.yft$/i, '').replace(/_hi$/i, '');

    for (const yft of yftFiles) {
      const base = baseOf(yft);
      const isHi = /_hi\.yft$/i.test(yft);
      let v = byBase.get(base);
      if (!v) {
        v = { name: base, yft: null, hiYft: null, ytds: [], dir: path.dirname(yft) };
        byBase.set(base, v);
      }
      if (isHi) v.hiYft = yft; else v.yft = yft;
    }

    // Attach textures: ytd whose name starts with the base, else any ytd sharing the dir.
    for (const v of byBase.values()) {
      const baseLower = v.name.toLowerCase();
      const dirLower = v.dir.toLowerCase();
      const matched = ytdFiles.filter((y) => {
        const yname = path.basename(y).toLowerCase().replace(/\.ytd$/, '');
        return yname === baseLower || yname.startsWith(baseLower) || yname.startsWith(baseLower + '+');
      });
      const sameDir = ytdFiles.filter((y) => path.dirname(y).toLowerCase() === dirLower);
      v.ytds = Array.from(new Set([...matched, ...sameDir]));
    }

    const vehicles = Array.from(byBase.values()).sort((a, b) => a.name.localeCompare(b.name));
    return { root, vehicles, meta };
  }

  /** Read a binary file as base64 for transfer to the renderer. */
  readBinaryBase64(filePath: string): string {
    return fs.readFileSync(filePath).toString('base64');
  }
}
