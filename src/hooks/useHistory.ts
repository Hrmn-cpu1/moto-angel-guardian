import { useCallback, useEffect, useState } from "react";
import { storage, STORAGE_KEYS } from "../lib/storage";
import type { HistoryItem } from "../types";

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(storage.get<HistoryItem[]>(STORAGE_KEYS.history, []));
  }, []);

  const add = useCallback((item: Omit<HistoryItem, "id" | "timestamp">) => {
    const next: HistoryItem = {
      ...item,
      id: `h-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    setItems((prev) => {
      const updated = [next, ...prev].slice(0, 50);
      storage.set(STORAGE_KEYS.history, updated);
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    storage.set(STORAGE_KEYS.history, []);
    setItems([]);
  }, []);

  return { items, add, clear };
}