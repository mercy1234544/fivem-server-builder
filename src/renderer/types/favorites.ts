// Favorites foundation — data model only. No UI or content system consumes
// this yet; it exists so the eventual Mercy content ecosystem (servers,
// vehicles, maps, mods, tracks...) can favorite/unfavorite items without a
// redesign. See useFavorites.ts for the persisted store.
export type FavoriteGame = 'fivem' | 'minecraft' | 'assettocorsa' | 'beamng';

export type FavoriteItemType =
  | 'server'
  | 'vehicle'
  | 'map'
  | 'mlo'
  | 'script'
  | 'minecraft-mod'
  | 'assetto-car'
  | 'assetto-track'
  | 'beamng-content';

export interface FavoriteItem {
  id: string;
  type: FavoriteItemType;
  game: FavoriteGame;
  name: string;
  addedAt: string;
  meta?: Record<string, unknown>;
}
