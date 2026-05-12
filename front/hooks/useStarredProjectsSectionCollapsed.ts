import { useCallback, useState } from "react";

const LOCAL_STORAGE_KEY = "starredProjectsSectionCollapsed";

export const useStarredProjectsSectionCollapsed = () => {
  const [isStarredProjectsSectionCollapsed, setCollapsedState] =
    useState<boolean>(() => {
      if (typeof window === "undefined") {
        return false;
      }
      try {
        return localStorage.getItem(LOCAL_STORAGE_KEY) === "true";
      } catch {
        return false;
      }
    });

  const setStarredProjectsSectionCollapsed = useCallback(
    (collapsed: boolean) => {
      setCollapsedState(collapsed);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, collapsed ? "true" : "false");
      } catch {
        // localStorage may be full or unavailable — silently ignore.
      }
    },
    []
  );

  return {
    isStarredProjectsSectionCollapsed,
    setStarredProjectsSectionCollapsed,
  };
};
