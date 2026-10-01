import { useCallback, useEffect, useMemo, useState } from "react";

interface FrecencyEntry<T> {
  count: number;
  lastVisited: number;
  item: T;
}

function computeFrecencyScore(entry: {
  count: number;
  lastVisited: number;
}): number {
  const ageHours = (Date.now() - entry.lastVisited) / (1000 * 60 * 60);
  const decay = Math.pow(0.5, ageHours / 72);
  return entry.count * decay;
}

function isFrecencyEntry<T>(value: unknown): value is FrecencyEntry<T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.count === "number" &&
    typeof entry.lastVisited === "number" &&
    "item" in entry &&
    entry.item != null
  );
}

function readFrecencyMap<T>(
  storageKey: string
): Record<string, FrecencyEntry<T>> {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return {};
    }
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const result: Record<string, FrecencyEntry<T>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isFrecencyEntry<T>(value)) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Frecency ranking with localStorage persistence.
 *
 * Callers MUST include a workspace id in `namespace` (e.g.
 * `command-palette-${owner.sId}`) so each workspace gets its own storage key.
 * The in-memory map is reloaded whenever that key changes so SPA workspace
 * switches cannot leak another workspace's items into view or storage.
 */
export function useFrecencySorting<T>(
  data: T[] | undefined,
  options?: {
    key?: (item: T) => string;
    /** Storage namespace; include a workspace id for workspace isolation. */
    namespace?: string;
    sortUnvisited?: (a: T, b: T) => number;
  }
): {
  data: T[];
  visitedItems: T[];
  visitItem: (item: T) => Promise<void>;
  resetRanking: (item: T) => Promise<void>;
} {
  const ns = options?.namespace || "default";
  const storageKey = `sc-frecency-${ns}`;
  const keyFn = options?.key;
  const sortUnvisited = options?.sortUnvisited;

  const getKey = useCallback(
    (item: T) => (keyFn ? keyFn(item) : String(item)),
    [keyFn]
  );

  const [frecencyMap, setFrecencyMap] = useState<
    Record<string, FrecencyEntry<T>>
  >(() => readFrecencyMap<T>(storageKey));
  // Tracks which storageKey the in-memory map was loaded for, so we never
  // persist workspace A's map under workspace B's key during a switch.
  const [activeStorageKey, setActiveStorageKey] = useState(storageKey);

  useEffect(() => {
    if (storageKey === activeStorageKey) {
      return;
    }
    setFrecencyMap(readFrecencyMap<T>(storageKey));
    setActiveStorageKey(storageKey);
  }, [storageKey, activeStorageKey]);

  useEffect(() => {
    if (storageKey !== activeStorageKey) {
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(frecencyMap));
    } catch {
      // best-effort
    }
  }, [frecencyMap, storageKey, activeStorageKey]);

  const visitedItems = useMemo(() => {
    return Object.values(frecencyMap)
      .sort((a, b) => computeFrecencyScore(b) - computeFrecencyScore(a))
      .map((entry) => entry.item);
  }, [frecencyMap]);

  const sortedData = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!Array.isArray(data)) {
      return [];
    }

    const items = [...data];
    items.sort((a, b) => {
      const keyA = getKey(a);
      const keyB = getKey(b);
      const entryA = frecencyMap[keyA];
      const entryB = frecencyMap[keyB];

      if (entryA && entryB) {
        return computeFrecencyScore(entryB) - computeFrecencyScore(entryA);
      }
      if (entryA && !entryB) {
        return -1;
      }
      if (!entryA && entryB) {
        return 1;
      }
      if (sortUnvisited) {
        return sortUnvisited(a, b);
      }
      return 0;
    });

    return items;
  }, [data, frecencyMap, getKey, sortUnvisited]);

  const visitItem = useCallback(
    async (item: T) => {
      const k = getKey(item);
      setFrecencyMap((prev) => {
        const entry = prev[k];
        return {
          ...prev,
          [k]: {
            count: (entry?.count || 0) + 1,
            lastVisited: Date.now(),
            item,
          },
        };
      });
    },
    [getKey]
  );

  const resetRanking = useCallback(
    async (item: T) => {
      const k = getKey(item);
      setFrecencyMap((prev) => {
        const updated = { ...prev };
        delete updated[k];
        return updated;
      });
    },
    [getKey]
  );

  return { data: sortedData, visitedItems, visitItem, resetRanking };
}
