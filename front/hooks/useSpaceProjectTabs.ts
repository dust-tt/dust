import { DEFAULT_TASK_OWNER_FILTER } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { PodUiScopedPreferences } from "@app/hooks/useScopedUIPreferences";
import { useCallback, useEffect, useRef } from "react";

export type PodTab = PodUiScopedPreferences["tab"];

export const DEFAULT_POD_UI_PREFERENCES: PodUiScopedPreferences = {
  tab: "conversations",
  conversationsFilter: "all",
  tasksOwnerFilter: DEFAULT_TASK_OWNER_FILTER,
};

/** Hash segment → tab when the user navigates with the hash (same pod). */
function parsePodTabFromLocationHash(fallbackTab: PodTab): PodTab {
  if (typeof window === "undefined") {
    return fallbackTab;
  }
  const hash = window.location.hash.slice(1);
  if (
    hash === "files" ||
    hash === "settings" ||
    hash === "conversations" ||
    hash === "tasks"
  ) {
    return hash;
  }
  return fallbackTab;
}

function replaceUrlHashWithTab(tab: PodTab) {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#${tab}`
  );
}

interface UsePodTabsParams {
  podId: string | null;
  podUiPreferences: PodUiScopedPreferences;
  setPodUiPreferences: (value: PodUiScopedPreferences) => void;
}

/**
 * Pod page tabs: URL hash mirrors `projectUIPreferences.tab` (per pod).
 *
 * One sync function runs on mount, `podId` change, and `hashchange`. If
 * the URL hash names a valid tab, state adopts it (so deep links like
 * `/pod/X#tasks` win over the persisted tab); otherwise the persisted
 * tab is written back into the URL asynchronously, so other layout hooks
 * (e.g. side panel) observe the previous hash first.
 *
 * Tab clicks go through `handleTabChange`, which writes URL + state
 * synchronously and bypasses the sync function.
 */
export function usePodTabs({
  podId,
  podUiPreferences,
  setPodUiPreferences,
}: UsePodTabsParams): {
  currentTab: PodTab;
  handleTabChange: (tab: PodTab) => void;
} {
  const onHashChangeRef = useRef<() => void>(() => {});

  onHashChangeRef.current = () => {
    const tabFromHash = parsePodTabFromLocationHash(podUiPreferences.tab);
    if (tabFromHash !== podUiPreferences.tab) {
      setPodUiPreferences({ ...podUiPreferences, tab: tabFromHash });
    } else if (window.location.hash !== `#${podUiPreferences.tab}`) {
      const newTab = podUiPreferences.tab;
      window.setTimeout(() => replaceUrlHashWithTab(newTab), 0);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !podId) {
      return;
    }
    const listener = () => onHashChangeRef.current();
    listener();
    window.addEventListener("hashchange", listener);
    return () => {
      window.removeEventListener("hashchange", listener);
    };
  }, [podId]);

  const handleTabChange = useCallback(
    (newTab: PodTab) => {
      replaceUrlHashWithTab(newTab);
      setPodUiPreferences({ ...podUiPreferences, tab: newTab });
    },
    [podUiPreferences, setPodUiPreferences]
  );

  return { currentTab: podUiPreferences.tab, handleTabChange };
}
