import {
  createExternalStore,
  useExternalStore,
} from "@app/poke/swr/externalStore";

// localStorage-backed array store shared across React consumers, synced across tabs via the
// `storage` event. Client-only (poke favorites).
export interface PersistentArrayStore<T> {
  useItems: () => T[];
  setItems: (updater: (prev: T[]) => T[]) => void;
}

function readArrayFromStorage<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createPersistentArrayStore<T>(
  key: string
): PersistentArrayStore<T> {
  // Stable empty reference for SSR / initial hydration render.
  const emptyArray: T[] = [];

  const store = createExternalStore<T[]>(readArrayFromStorage<T>(key));

  const setItems = (updater: (prev: T[]) => T[]): void => {
    const next = updater(store.getSnapshot());
    if (next === store.getSnapshot()) {
      return;
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Silently fail if localStorage is not available.
      }
    }
    store.setSnapshot(next);
  };

  // Cross-tab sync: refresh from storage when another tab writes the same key.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === key) {
        store.setSnapshot(readArrayFromStorage<T>(key));
      }
    });
  }

  const useItems = (): T[] => useExternalStore(store, () => emptyArray);

  return { useItems, setItems };
}
