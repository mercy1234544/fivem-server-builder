import { create } from 'zustand';
import type { AppNotification, NotificationCategory } from '../types/notification';

// Same persisted-zustand shape as useAppStore.ts. Nothing seeds this with
// fake server/Mercy activity — it starts empty, and only fills from real
// producers (see NotificationBell.tsx, which wires appUpdater + server
// status events) or genuine local/system events added later.
const STORAGE_KEY = 'mercy-notifications';
const MAX_NOTIFICATIONS = 50;

function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveNotifications(items: AppNotification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

interface NotificationsState {
  notifications: AppNotification[];
  push: (n: { title: string; message: string; category: NotificationCategory }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  notifications: loadNotifications(),

  push: ({ title, message, category }) => {
    const entry: AppNotification = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      title,
      message,
      category,
      timestamp: new Date().toISOString(),
      read: false,
    };
    const notifications = [entry, ...get().notifications].slice(0, MAX_NOTIFICATIONS);
    set({ notifications });
    saveNotifications(notifications);
  },

  markRead: (id) => {
    const notifications = get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    set({ notifications });
    saveNotifications(notifications);
  },

  markAllRead: () => {
    const notifications = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications });
    saveNotifications(notifications);
  },

  dismiss: (id) => {
    const notifications = get().notifications.filter((n) => n.id !== id);
    set({ notifications });
    saveNotifications(notifications);
  },

  clearAll: () => {
    set({ notifications: [] });
    saveNotifications([]);
  },
}));
