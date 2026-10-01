import { useCallback, useMemo, useState } from "react";

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
    return parsed as Record<string, FrecencyEntry<T>>;
  } catch {
    return {};
  }
}

export function useFrecencySorting<T>(
  data: T[] | undefined,
  options?: {
    key?: (item: T) => string;
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

  const persistMap = useCallback(
    (map: Record<string, FrecencyEntry<T>>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(map));
      } catch {
        // best-effort
      }
    },
    [storageKey]
  );

  const visitedItems = useMemo(() => {
    return Object.values(frecencyMap)
      .filter((entry) => entry.item != null)
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
        const updated = {
          ...prev,
          [k]: {
            count: (entry?.count || 0) + 1,
            lastVisited: Date.now(),
            item,
          },
        };
        persistMap(updated);
        return updated;
      });
    },
    [getKey, persistMap]
  );

  const resetRanking = useCallback(
    async (item: T) => {
      const k = getKey(item);
      setFrecencyMap((prev) => {
        const updated = { ...prev };
        delete updated[k];
        persistMap(updated);
        return updated;
      });
    },
    [getKey, persistMap]
  );

  return { data: sortedData, visitedItems, visitItem, resetRanking };
}
