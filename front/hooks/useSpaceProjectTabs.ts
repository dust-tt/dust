import { DEFAULT_TODO_OWNER_FILTER } from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosListScope";
import {
  type ProjectUIScopedPreferences,
  readScopedUIPreferencesValue,
} from "@app/hooks/useScopedUIPreferences";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type SpaceProjectTab = ProjectUIScopedPreferences["tab"];

export const DEFAULT_SPACE_PROJECT_UI_PREFERENCES: ProjectUIScopedPreferences =
  {
    tab: "conversations",
    conversationsFilter: "all",
    todosOwnerFilter: DEFAULT_TODO_OWNER_FILTER,
  };

/** Hash segment → tab when the user navigates with the hash (same space). */
export function parseSpaceTabFromLocationHash(
  fallbackTab: SpaceProjectTab
): SpaceProjectTab {
  if (typeof window === "undefined") {
    return fallbackTab;
  }
  const hash = window.location.hash.slice(1);
  if (hash === "context") {
    return "knowledge";
  }
  if (
    hash === "knowledge" ||
    hash === "settings" ||
    hash === "conversations" ||
    hash === "todos" ||
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
  canShowTodosTab: boolean;
}

/**
 * Space page tabs: URL hash + `projectUI` scoped preferences (per space).
 * - On `spaceId` change: restore persisted tab and sync the hash.
 * - On `hashchange`: follow hash and persist.
 * - Empty hash: deferred `replaceState` so other layout hooks can observe an empty hash first.
 */
export function useSpaceProjectTabs({
  spaceId,
  projectUIPreferences,
  setProjectUIPreferences,
  canShowTodosTab,
}: UseSpaceProjectTabsParams): {
  currentTab: SpaceProjectTab;
  handleTabChange: (tab: SpaceProjectTab) => void;
} {
  const [currentTab, setCurrentTab] =
    useState<SpaceProjectTab>("conversations");

  useLayoutEffect(() => {
    if (!spaceId || typeof window === "undefined") {
      return;
    }
    const persisted = readScopedUIPreferencesValue(
      "projectUI",
      spaceId,
      DEFAULT_SPACE_PROJECT_UI_PREFERENCES
    );
    const newTab = persisted.tab;
    setCurrentTab(newTab);
    replaceUrlHashWithTab(newTab);
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) {
      return;
    }
    const onHashChange = () => {
      const persisted = readScopedUIPreferencesValue(
        "projectUI",
        spaceId,
        DEFAULT_SPACE_PROJECT_UI_PREFERENCES
      );
      const tab = parseSpaceTabFromLocationHash(persisted.tab);
      setCurrentTab(tab);
      setProjectUIPreferences({
        ...persisted,
        tab,
      });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [setProjectUIPreferences, spaceId]);

  useEffect(() => {
    if (typeof window === "undefined" || !spaceId) {
      return;
    }
    if (!window.location.hash) {
      const persisted = readScopedUIPreferencesValue(
        "projectUI",
        spaceId,
        DEFAULT_SPACE_PROJECT_UI_PREFERENCES
      );
      const newTab = persisted.tab;
      const timeoutId = window.setTimeout(() => {
        if (!window.location.hash) {
          replaceUrlHashWithTab(newTab);
        }
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [spaceId]);

  useEffect(() => {
    if (currentTab === "todos" && !canShowTodosTab) {
      setCurrentTab("conversations");
      setProjectUIPreferences({
        ...projectUIPreferences,
        tab: "conversations",
      });
      replaceUrlHashWithTab("conversations");
    }
  }, [
    canShowTodosTab,
    currentTab,
    projectUIPreferences,
    setProjectUIPreferences,
  ]);

  const handleTabChange = useCallback(
    (tab: SpaceProjectTab) => {
      replaceUrlHashWithTab(tab);
      setCurrentTab(tab);
      setProjectUIPreferences({
        ...projectUIPreferences,
        tab,
      });
    },
    [projectUIPreferences, setProjectUIPreferences]
  );

  return { currentTab, handleTabChange };
}
