import { useCallback, useState } from "react";

const LOCAL_STORAGE_KEY = "starredPodsSectionCollapsed";

export const useStarredPodsSectionCollapsed = () => {
  const [isStarredPodsSectionCollapsed, setCollapsedState] = useState<boolean>(
    () => {
      if (typeof window === "undefined") {
        return false;
      }
      try {
        return localStorage.getItem(LOCAL_STORAGE_KEY) === "true";
      } catch {
        return false;
      }
    }
  );

  const setStarredPodsSectionCollapsed = useCallback((collapsed: boolean) => {
    setCollapsedState(collapsed);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // localStorage may be full or unavailable — silently ignore.
    }
  }, []);

  return {
    isStarredPodsSectionCollapsed,
    setStarredPodsSectionCollapsed,
  };
};
