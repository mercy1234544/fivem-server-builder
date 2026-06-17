// YFT (fragment / drawable) geometry parser — the native vehicle-model engine.
//
// Status: foundation in place (RSC7 unpack + pointer resolution via ./resource).
// The drawable/geometry decode (vertex declarations, LOD models, per-shader
// geometries) is being completed against real vehicle files. Until it returns
// confident geometry it yields null so the loader can report an honest status
// instead of rendering a wrong mesh.
//
// This is the primary path the architecture is built around: when parseYftGeometry
// returns meshes, the editor's real-vehicle preview lights up with zero UI changes.

import { unpackRSC7, ResourceReader } from './resource';

export interface ParsedGeometry {
  name: string;
  positions: Float32Array;   // xyz triples
  uvs: Float32Array | null;  // uv pairs
  normals: Float32Array | null;
  indices: Uint32Array;
  shaderIndex: number;
}

export interface ParsedDrawable {
  geometries: ParsedGeometry[];
  /** Texture name per shader index, when resolvable. */
  shaderTextureNames: (string | null)[];
}

export interface YftParseResult {
  drawable: ParsedDrawable | null;
  /** Why geometry isn't available yet, for honest UX. */
  reason?: string;
}

export async function parseYftGeometry(buffer: ArrayBuffer): Promise<YftParseResult> {
  const bytes = new Uint8Array(buffer);
  const res = await unpackRSC7(bytes);
  if (!res) return { drawable: null, reason: 'Not an RSC7 resource (file may be compressed differently).' };

  // Reader is ready for drawable traversal. Geometry decode is being finalized
  // against real files — return a clear, honest "not yet" rather than a guess.
  void new ResourceReader(res);
  return {
    drawable: null,
    reason: 'Native model engine is being finalized for this vehicle format.',
  };
}
