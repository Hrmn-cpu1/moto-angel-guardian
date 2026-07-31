// Lightweight local storage wrapper. Capacitor Preferences can wrap this later.
export const storage = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

export const STORAGE_KEYS = {
  session: "motoanjo.session",
  users: "motoanjo.users",
  contacts: "motoanjo.contacts",
  history: "motoanjo.history",
  trips: "motoanjo.trips",
} as const;
