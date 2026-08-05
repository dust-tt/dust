import { useCallback, useState } from "react";

/**
 * Collapsed state for a sidebar section, persisted in localStorage.
 *
 * `storageKey` is part of the persisted contract: changing it resets the
 * collapsed state for every user.
 */
export const useSidebarSectionCollapsed = (storageKey: string) => {
  const [isCollapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      setCollapsedState(collapsed);
      try {
        localStorage.setItem(storageKey, collapsed ? "true" : "false");
      } catch {
        // localStorage may be full or unavailable — silently ignore.
      }
    },
    [storageKey]
  );

  return { isCollapsed, setCollapsed };
};
