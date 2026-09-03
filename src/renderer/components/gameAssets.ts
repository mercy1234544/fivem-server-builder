// Drop-in per-game asset system for the Home hero cards.
//
// EXACT PATHS TO REPLACE WITH LICENSED ART — create the file and it is picked
// up automatically; nothing in React needs to change:
//
//   src/renderer/assets/games/fivem/background.(jpg|jpeg|png|webp)
//   src/renderer/assets/games/fivem/logo.(png|svg|webp)
//   src/renderer/assets/games/fivem/overlay.(png|webp)          [optional]
//
//   src/renderer/assets/games/minecraft/background.*
//   src/renderer/assets/games/minecraft/logo.*
//   src/renderer/assets/games/minecraft/overlay.*               [optional]
//
//   src/renderer/assets/games/assettocorsa/background.*
//   src/renderer/assets/games/assettocorsa/logo.*
//   src/renderer/assets/games/assettocorsa/overlay.*            [optional]
//
//   src/renderer/assets/games/beamng/background.*
//   src/renderer/assets/games/beamng/logo.*
//   src/renderer/assets/games/beamng/overlay.*                  [optional]
//
// `background` fills the card; `logo` sits over it (rendered with
// object-contain so it's never stretched); `overlay` is an optional extra
// image layer (e.g. a texture or light leak) composited above the background
// and below the logo/text. Any game folder with no files just uses the
// built-in illustrated fallback (GameArt.tsx) — nothing breaks.
//
// import.meta.glob scans the filesystem at build time, so a game with no
// files here simply resolves to an empty match — no error, no missing-file
// warning, the fallback renders instead.
const backgrounds = import.meta.glob('../assets/games/*/background.*', { eager: true, import: 'default' }) as Record<string, string>;
const logos = import.meta.glob('../assets/games/*/logo.*', { eager: true, import: 'default' }) as Record<string, string>;
const overlays = import.meta.glob('../assets/games/*/overlay.*', { eager: true, import: 'default' }) as Record<string, string>;

function findAsset(map: Record<string, string>, gameId: string): string | undefined {
  const key = Object.keys(map).find((k) => k.includes(`/games/${gameId}/`));
  return key ? map[key] : undefined;
}

export interface GameAssets { background?: string; logo?: string; overlay?: string; }

export function getGameAssets(gameId: string): GameAssets {
  return {
    background: findAsset(backgrounds, gameId),
    logo: findAsset(logos, gameId),
    overlay: findAsset(overlays, gameId),
  };
}
