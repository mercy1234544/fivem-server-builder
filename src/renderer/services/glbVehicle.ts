// Loads a real GTA vehicle exported to GLB/glTF (via CodeWalker or Sollumz/Blender)
// and exposes its actual material slots, textures, and UV layouts.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface VehicleMaterialSlot {
  id: string;
  name: string;
  material: THREE.MeshStandardMaterial;
  meshes: THREE.Mesh[];
  originalMap: THREE.Texture | null;
  /** Best-guess vehicle section from the material/mesh name (hood, doors, roof…). */
  section: string;
}

export interface LoadedVehicle {
  root: THREE.Group;
  slots: VehicleMaterialSlot[];
  meshes: THREE.Mesh[];
  size: THREE.Vector3;
  center: THREE.Vector3;
}

// Heuristic mapping from GTA material/mesh names to human sections.
const SECTION_RULES: [RegExp, string][] = [
  [/paint|livery|body|chassis|primary|secondary/i, 'Body / Livery'],
  [/hood|bonnet/i, 'Hood'],
  [/door/i, 'Doors'],
  [/roof/i, 'Roof'],
  [/bumper|bump_|grille|grill/i, 'Bumpers'],
  [/trunk|boot|tailgate/i, 'Trunk'],
  [/window|glass|windscreen|windshield/i, 'Glass'],
  [/wheel|tyre|tire|rim/i, 'Wheels'],
  [/light|lamp|indicator|emiss/i, 'Lights'],
  [/interior|seat|dash/i, 'Interior'],
  [/badge|decal|sign|logo|number/i, 'Decals'],
  [/chrome|metal|trim/i, 'Trim'],
  [/plate/i, 'Plate'],
];

function guessSection(name: string): string {
  for (const [re, label] of SECTION_RULES) if (re.test(name)) return label;
  return 'Other';
}

export function loadVehicleGLB(buffer: ArrayBuffer): Promise<LoadedVehicle> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      buffer,
      '',
      (gltf) => {
        try {
          resolve(buildVehicle(gltf.scene));
        } catch (e) {
          reject(e);
        }
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err)))
    );
  });
}

function buildVehicle(scene: THREE.Group): LoadedVehicle {
  const meshes: THREE.Mesh[] = [];
  const slotByMaterial = new Map<THREE.Material, VehicleMaterialSlot>();

  scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      // Normalise to MeshStandardMaterial so we always have .map / .emissive etc.
      let mat = raw as THREE.MeshStandardMaterial;
      if (!(mat as any).isMeshStandardMaterial) {
        const std = new THREE.MeshStandardMaterial({
          map: (raw as any).map ?? null,
          color: (raw as any).color ?? new THREE.Color(0xcccccc),
          metalness: 0.55,
          roughness: 0.45,
        });
        std.name = raw.name;
        if (Array.isArray(mesh.material)) {
          const idx = mesh.material.indexOf(raw);
          if (idx >= 0) mesh.material[idx] = std;
        } else {
          mesh.material = std;
        }
        mat = std;
      }

      let slot = slotByMaterial.get(mat);
      if (!slot) {
        const name = mat.name || `material_${slotByMaterial.size}`;
        slot = {
          id: `slot_${slotByMaterial.size}`,
          name,
          material: mat,
          meshes: [],
          originalMap: mat.map ?? null,
          section: guessSection(`${name} ${mesh.name}`),
        };
        slotByMaterial.set(mat, slot);
      }
      if (!slot.meshes.includes(mesh)) slot.meshes.push(mesh);
    }
  });

  const slots = Array.from(slotByMaterial.values());

  // Centre + scale info for camera framing.
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Recentre the model at origin so orbiting feels natural.
  scene.position.sub(center);

  // Sort slots so paint/livery slots float to the top.
  slots.sort((a, b) => {
    const score = (s: VehicleMaterialSlot) =>
      /Body|Livery|Decals/.test(s.section) ? 0 : s.section === 'Other' ? 2 : 1;
    return score(a) - score(b);
  });

  return { root: scene, slots, meshes, size, center: new THREE.Vector3(0, 0, 0) };
}

/**
 * Build UV-edge line segments for every mesh in a slot, in [0,1] UV space.
 * Returns flat pairs of [x0,y0,x1,y1, …] suitable for drawing a UV wireframe.
 */
export function slotUVEdges(slot: VehicleMaterialSlot): Float32Array {
  const segs: number[] = [];

  for (const mesh of slot.meshes) {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
    if (!uv) continue;

    const pushTri = (a: number, b: number, c: number) => {
      const ax = uv.getX(a), ay = uv.getY(a);
      const bx = uv.getX(b), by = uv.getY(b);
      const cx = uv.getX(c), cy = uv.getY(c);
      segs.push(ax, ay, bx, by, bx, by, cx, cy, cx, cy, ax, ay);
    };

    if (geo.index) {
      const idx = geo.index;
      for (let i = 0; i < idx.count; i += 3) {
        pushTri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      }
    } else {
      for (let i = 0; i < uv.count; i += 3) pushTri(i, i + 1, i + 2);
    }
  }

  return new Float32Array(segs);
}

/** Read the original texture of a slot into an ImageData (or null if none). */
export function slotTextureToImageData(slot: VehicleMaterialSlot): ImageData | null {
  const tex = slot.originalMap;
  const img = tex?.image as (HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined);
  if (!img) return null;
  const w = (img as any).width || 0;
  const h = (img as any).height || 0;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  try {
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}
