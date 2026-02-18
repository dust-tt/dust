import { useCallback, useState } from "react";

const LOCAL_STORAGE_KEY = "agentBrowserSelection";

function readStore(): Record<string, string | null> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string | null>;
      }
    }
  } catch {
    // Corrupted or unavailable localStorage — start fresh.
  }
  return {};
}

export const usePersistedAgentBrowserSelection = (workspaceId: string) => {
  const [selectedTagId, setSelectedTagIdState] = useState<string | null>(
    () => readStore()[workspaceId] ?? null
  );

  const setSelectedTagId = useCallback(
    (tagId: string | null) => {
      setSelectedTagIdState(tagId);
      try {
        const store = readStore();
        store[workspaceId] = tagId;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
      } catch {
        // localStorage may be full or unavailable — silently ignore.
      }
    },
    [workspaceId]
  );

  return {
    selectedTagId,
    setSelectedTagId,
  };
};
