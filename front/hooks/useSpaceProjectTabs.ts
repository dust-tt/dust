import { DEFAULT_TASK_OWNER_FILTER } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { PodUiScopedPreferences } from "@app/hooks/useScopedUIPreferences";
import { useViewChangeGuard } from "@app/hooks/useViewChangeGuard";
import {
  isPodFileTabValue,
  makePodFileTabValue,
  parsePodFileTabPath,
} from "@app/types/pod_file_tab";
import { useCallback, useEffect, useRef } from "react";

export type SystemPodTab = "conversations" | "tasks" | "files" | "settings";

export type PodTab = PodUiScopedPreferences["tab"];

export const DEFAULT_POD_UI_PREFERENCES: PodUiScopedPreferences = {
  tab: "conversations",
  conversationsFilter: "all",
  hideTriggeredConversations: false,
  tasksOwnerFilter: DEFAULT_TASK_OWNER_FILTER,
};

const CONNECTED_DATA_QUERY_PARAMS = ["dsvId", "parentId", "q"] as const;

const SYSTEM_POD_TAB_HASHES = new Set<string>([
  "files",
  "settings",
  "conversations",
  "tasks",
]);

function isSystemPodTab(tab: string): tab is SystemPodTab {
  return SYSTEM_POD_TAB_HASHES.has(tab);
}

/** Hash segment → tab when the user navigates with the hash (same pod). */
function parsePodTabFromLocationHash(fallbackTab: PodTab): PodTab {
  if (typeof window === "undefined") {
    return fallbackTab;
  }
  const hash = window.location.hash.slice(1);
  if (isSystemPodTab(hash)) {
    return hash;
  }
  if (hash.startsWith("frame/")) {
    try {
      const path = decodeURIComponent(hash.slice("frame/".length));
      if (path.length > 0) {
        return makePodFileTabValue(path);
      }
    } catch {
      return fallbackTab;
    }
  }
  return fallbackTab;
}

function hasConnectedDataQueryParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return CONNECTED_DATA_QUERY_PARAMS.some((key) => params.has(key));
}

function tabToHash(tab: PodTab): string {
  const framePath = parsePodFileTabPath(tab);
  return framePath ? `frame/${encodeURIComponent(framePath)}` : tab;
}

function replaceUrlWithTab(tab: PodTab) {
  const url = new URL(window.location.href);
  if (tab !== "connected_data") {
    for (const key of CONNECTED_DATA_QUERY_PARAMS) {
      url.searchParams.delete(key);
    }
  }
  url.hash = tabToHash(tab);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

interface UsePodTabsParams {
  podId: string | null;
  podUiPreferences: PodUiScopedPreferences;
  setPodUiPreferences: (value: PodUiScopedPreferences) => void;
}

/**
 * Pod page tabs: URL hash mirrors `projectUIPreferences.tab` (per pod).
 *
 * System tabs use `#conversations` etc. Frame tabs use `#frame/<encoded-path>`.
 *
 * Tab clicks wait for the active document to save before updating URL and state.
 *
 * Leaving Connected Data also drops its navigation query params (`dsvId`,
 * `parentId`, `q`). Non-admin-controlled Pods cannot stay on that tab.
 */
export function usePodTabs({
  podId,
  podUiPreferences,
  setPodUiPreferences,
}: UsePodTabsParams): {
  currentTab: PodTab;
  handleTabChange: (tab: PodTab) => void;
  registerBeforeChange: ReturnType<
    typeof useViewChangeGuard
  >["registerBeforeChange"];
} {
  const { registerBeforeChange, changeView } = useViewChangeGuard();
  const onHashChangeRef = useRef<() => void>(() => {});

  onHashChangeRef.current = () => {
    const tabFromHash = parsePodTabFromLocationHash(podUiPreferences.tab);
    const resolved = tabFromHash;
    const expectedHash = `#${tabToHash(podUiPreferences.tab)}`;
    if (resolved !== podUiPreferences.tab) {
      setPodUiPreferences({ ...podUiPreferences, tab: resolved });
      if (
        window.location.hash !== `#${tabToHash(resolved)}` ||
        (resolved !== "connected_data" && hasConnectedDataQueryParams())
      ) {
        replaceUrlWithTab(resolved);
      }
    } else if (window.location.hash !== expectedHash) {
      const newTab = podUiPreferences.tab;
      window.setTimeout(() => replaceUrlWithTab(newTab), 0);
    } else if (resolved !== "connected_data" && hasConnectedDataQueryParams()) {
      // Preferences already match the hash, but Connected Data params may
      // still be present (e.g. deep link to another tab with leftover query).
      replaceUrlWithTab(resolved);
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
      changeView(() => {
        replaceUrlWithTab(newTab);
        setPodUiPreferences({ ...podUiPreferences, tab: newTab });
      });
    },
    [changeView, podUiPreferences, setPodUiPreferences]
  );

  return {
    currentTab: podUiPreferences.tab,
    handleTabChange,
    registerBeforeChange,
  };
}

export function isValidPodTabValue(value: string): value is PodTab {
  return isSystemPodTab(value) || isPodFileTabValue(value);
}
