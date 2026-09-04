import { create } from 'zustand';
import type { FavoriteItem } from '../types/favorites';

// Same persisted-zustand shape as useAppStore.ts (localStorage, load/save
// helpers) — no fake items are ever seeded, this starts and stays empty
// until the Mercy ecosystem actually has content to favorite.
const STORAGE_KEY = 'mercy-favorites';

function loadFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveFavorites(items: FavoriteItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

interface FavoritesState {
  favorites: FavoriteItem[];
  isFavorite: (id: string) => boolean;
  add: (item: Omit<FavoriteItem, 'addedAt'>) => void;
  remove: (id: string) => void;
  toggle: (item: Omit<FavoriteItem, 'addedAt'>) => void;
  clear: () => void;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  favorites: loadFavorites(),

  isFavorite: (id) => get().favorites.some((f) => f.id === id),

  add: (item) => {
    if (get().isFavorite(item.id)) return;
    const favorites = [...get().favorites, { ...item, addedAt: new Date().toISOString() }];
    set({ favorites });
    saveFavorites(favorites);
  },

  remove: (id) => {
    const favorites = get().favorites.filter((f) => f.id !== id);
    set({ favorites });
    saveFavorites(favorites);
  },

  toggle: (item) => {
    if (get().isFavorite(item.id)) get().remove(item.id);
    else get().add(item);
  },

  clear: () => {
    set({ favorites: [] });
    saveFavorites([]);
  },
}));
