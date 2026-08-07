import { DEFAULT_TASK_OWNER_FILTER } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { PodUiScopedPreferences } from "@app/hooks/useScopedUIPreferences";
import {
  isPodFrameTabValue,
  makePodFrameTabValue,
  parsePodFrameTabPath,
} from "@app/types/pod_frame_tab";
import { useCallback, useEffect, useRef } from "react";

export type SystemPodTab =
  | "conversations"
  | "tasks"
  | "files"
  | "databases"
  | "connected_data"
  | "settings";

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
  "databases",
  "connected_data",
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
        return makePodFrameTabValue(path);
      }
    } catch {
      return fallbackTab;
    }
  }
  return fallbackTab;
}

/** Gates for the system tabs that are not shown on every Pod, to every member. */
interface PodTabGates {
  /** Connected Data is only available on admin-controlled Pods. */
  isAdminControlled?: boolean;
  /** Databases is only available to Pod editors, with Sandbox Functions enabled. */
  canViewDatabases?: boolean;
}

/**
 * Remap a tab the current user cannot see onto Conversations.
 * `undefined` means pod info (or the feature flag) is still loading — keep the tab as-is.
 */
function resolvePodTab(
  tab: PodTab,
  { isAdminControlled, canViewDatabases }: PodTabGates
): PodTab {
  if (tab === "connected_data" && isAdminControlled === false) {
    return "conversations";
  }
  if (tab === "databases" && canViewDatabases === false) {
    return "conversations";
  }
  return tab;
}

function hasConnectedDataQueryParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return CONNECTED_DATA_QUERY_PARAMS.some((key) => params.has(key));
}

function tabToHash(tab: PodTab): string {
  const framePath = parsePodFrameTabPath(tab);
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

interface UsePodTabsParams extends PodTabGates {
  podId: string | null;
  podUiPreferences: PodUiScopedPreferences;
  setPodUiPreferences: (value: PodUiScopedPreferences) => void;
}

/**
 * Pod page tabs: URL hash mirrors `projectUIPreferences.tab` (per pod).
 *
 * System tabs use `#conversations` etc. Frame tabs use `#frame/<encoded-path>`.
 *
 * Tab clicks go through `handleTabChange`, which writes URL + state
 * synchronously and bypasses the sync function.
 *
 * Leaving Connected Data also drops its navigation query params (`dsvId`,
 * `parentId`, `q`). Non-admin-controlled Pods cannot stay on that tab.
 */
export function usePodTabs({
  podId,
  podUiPreferences,
  setPodUiPreferences,
  isAdminControlled,
  canViewDatabases,
}: UsePodTabsParams): {
  currentTab: PodTab;
  handleTabChange: (tab: PodTab) => void;
} {
  const onHashChangeRef = useRef<() => void>(() => {});
  const gates: PodTabGates = { isAdminControlled, canViewDatabases };

  onHashChangeRef.current = () => {
    const tabFromHash = parsePodTabFromLocationHash(podUiPreferences.tab);
    const resolved = resolvePodTab(tabFromHash, gates);
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

  // Remap a persisted/URL tab the user turns out not to be allowed on (pod info and feature
  // flags load after the hash sync above).
  useEffect(() => {
    const resolved = resolvePodTab(podUiPreferences.tab, {
      isAdminControlled,
      canViewDatabases,
    });
    if (resolved === podUiPreferences.tab) {
      return;
    }
    setPodUiPreferences({ ...podUiPreferences, tab: resolved });
    if (typeof window !== "undefined") {
      replaceUrlWithTab(resolved);
    }
  }, [
    isAdminControlled,
    canViewDatabases,
    podUiPreferences,
    setPodUiPreferences,
  ]);

  const handleTabChange = useCallback(
    (newTab: PodTab) => {
      const resolved = resolvePodTab(newTab, {
        isAdminControlled,
        canViewDatabases,
      });
      replaceUrlWithTab(resolved);
      setPodUiPreferences({ ...podUiPreferences, tab: resolved });
    },
    [podUiPreferences, setPodUiPreferences, isAdminControlled, canViewDatabases]
  );

  return {
    currentTab: resolvePodTab(podUiPreferences.tab, gates),
    handleTabChange,
  };
}

export function isValidPodTabValue(value: string): value is PodTab {
  return isSystemPodTab(value) || isPodFrameTabValue(value);
}
