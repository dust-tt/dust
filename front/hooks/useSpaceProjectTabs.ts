import { DEFAULT_TASK_OWNER_FILTER } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { ProjectUIScopedPreferences } from "@app/hooks/useScopedUIPreferences";
import { useCallback, useEffect, useRef } from "react";

export type SpaceProjectTab = ProjectUIScopedPreferences["tab"];

export const DEFAULT_SPACE_PROJECT_UI_PREFERENCES: ProjectUIScopedPreferences =
  {
    tab: "conversations",
    conversationsFilter: "all",
    tasksOwnerFilter: DEFAULT_TASK_OWNER_FILTER,
  };

/** Hash segment → tab when the user navigates with the hash (same space). */
export function parseSpaceTabFromLocationHash(
  fallbackTab: SpaceProjectTab
): SpaceProjectTab {
  if (typeof window === "undefined") {
    return fallbackTab;
  }
  const hash = window.location.hash.slice(1);
  if (hash === "context" || hash === "knowledge") {
    return "files";
  }
  if (
    hash === "files" ||
    hash === "settings" ||
    hash === "conversations" ||
    hash === "tasks" ||
    hash === "alpha"
  ) {
    return hash;
  }
  return fallbackTab;
}

function replaceUrlHashWithTab(tab: SpaceProjectTab) {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#${tab}`
  );
}

interface UseSpaceProjectTabsParams {
  spaceId: string | null;
  projectUIPreferences: ProjectUIScopedPreferences;
  setProjectUIPreferences: (value: ProjectUIScopedPreferences) => void;
}

/**
 * Space page tabs: URL hash mirrors `projectUIPreferences.tab` (per space).
 *
 * One sync function runs on mount, `spaceId` change, and `hashchange`. If
 * the URL hash names a valid tab, state adopts it (so deep links like
 * `/space/X#tasks` win over the persisted tab); otherwise the persisted
 * tab is written back into the URL asynchronously, so other layout hooks
 * (e.g. side panel) observe the previous hash first.
 *
 * Tab clicks go through `handleTabChange`, which writes URL + state
 * synchronously and bypasses the sync function.
 */
export function useSpaceProjectTabs({
  spaceId,
  projectUIPreferences,
  setProjectUIPreferences,
}: UseSpaceProjectTabsParams): {
  currentTab: SpaceProjectTab;
  handleTabChange: (tab: SpaceProjectTab) => void;
} {
  const onHashChangeRef = useRef<() => void>(() => {});

  onHashChangeRef.current = () => {
    const tabFromHash = parseSpaceTabFromLocationHash(projectUIPreferences.tab);
    if (tabFromHash !== projectUIPreferences.tab) {
      setProjectUIPreferences({ ...projectUIPreferences, tab: tabFromHash });
    } else if (window.location.hash !== `#${projectUIPreferences.tab}`) {
      const newTab = projectUIPreferences.tab;
      window.setTimeout(() => replaceUrlHashWithTab(newTab), 0);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !spaceId) {
      return;
    }
    const listener = () => onHashChangeRef.current();
    listener();
    window.addEventListener("hashchange", listener);
    return () => {
      window.removeEventListener("hashchange", listener);
    };
  }, [spaceId]);

  const handleTabChange = useCallback(
    (newTab: SpaceProjectTab) => {
      replaceUrlHashWithTab(newTab);
      setProjectUIPreferences({ ...projectUIPreferences, tab: newTab });
    },
    [projectUIPreferences, setProjectUIPreferences]
  );

  return { currentTab: projectUIPreferences.tab, handleTabChange };
}
