import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import type { NavigationHistoryState } from "@app/components/data_source_view/context/useNavigationHistory";
import { useNavigationHistory } from "@app/components/data_source_view/context/useNavigationHistory";
import type { EnrichedSpaceType } from "@app/types/space";
import { useCallback, useEffect, useMemo, useRef } from "react";

// Pods only expose connected data, so the browser skips their category level; that level is
// therefore neither a place to stop on the way up nor a crumb worth showing.
function isSkippedPodCategory(
  navigationHistory: NavigationHistoryEntryType[],
  index: number
): boolean {
  const space = navigationHistory[1];
  return (
    index === 2 &&
    navigationHistory[index]?.type === "category" &&
    space?.type === "space" &&
    space.space.kind === "project"
  );
}

/**
 * @cc [owner:smb2268,label:product] navigate-up-skips-shortcut-levels
 * Going up MUST land on the nearest ancestor the user can stay on: from a pod's data source or
 * category level it lands on the root, since the pod's space level immediately re-enters its
 * category. At the root it is a no-op.
 */
export function getNavigateUpIndex(
  navigationHistory: NavigationHistoryEntryType[]
): number {
  let index = navigationHistory.length - 2;
  // Landing on a pod's space level would bounce straight back down; go to the root instead.
  if (index === 1 && isSkippedPodCategory(navigationHistory, 2)) {
    index = 0;
  }
  return Math.max(index, 0);
}

// The entries worth showing as breadcrumbs, with their index in the history for navigation.
export function getVisibleNavigationEntries(
  navigationHistory: NavigationHistoryEntryType[]
): { entry: NavigationHistoryEntryType; index: number }[] {
  return navigationHistory
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !isSkippedPodCategory(navigationHistory, index));
}

// Navigation state for a knowledge browser, with the Agent Builder's shortcuts: a lone space is
// entered directly and pods skip the category level since they only expose connected data.
// `reset` returns to the root and lets the lone-space shortcut apply again, for a browser that
// stays mounted between uses.
export function useKnowledgeBrowserNavigation({
  spaces,
  enabled = true,
}: {
  spaces: EnrichedSpaceType[];
  // When false the shortcuts stay idle so a hidden browser never fetches a space.
  enabled?: boolean;
}): NavigationHistoryState & { navigateUp: () => void; reset: () => void } {
  const navigation = useNavigationHistory();
  const { navigationHistory, navigateTo, setSpaceEntry, setCategoryEntry } =
    navigation;
  const currentEntry = navigationHistory[navigationHistory.length - 1];

  // Remembered so a refetched `spaces` array does not pull the user back to that space.
  const autoEnteredSpaceId = useRef<string | null>(null);
  useEffect(() => {
    const loneSpace = spaces.length === 1 ? spaces[0] : null;
    // Keyed on the history itself: a reset from the root yields a fresh array but the same entry.
    const isRoot = navigationHistory.length === 1;
    if (
      enabled &&
      isRoot &&
      loneSpace &&
      autoEnteredSpaceId.current !== loneSpace.sId
    ) {
      autoEnteredSpaceId.current = loneSpace.sId;
      setSpaceEntry(loneSpace);
    }
  }, [enabled, navigationHistory, spaces, setSpaceEntry]);

  useEffect(() => {
    if (
      enabled &&
      currentEntry.type === "space" &&
      currentEntry.space.kind === "project"
    ) {
      setCategoryEntry("managed");
    }
  }, [currentEntry, enabled, setCategoryEntry]);

  const navigateUp = useCallback(
    () => navigateTo(getNavigateUpIndex(navigationHistory)),
    [navigateTo, navigationHistory]
  );

  const reset = useCallback(() => {
    autoEnteredSpaceId.current = null;
    navigateTo(0);
  }, [navigateTo]);

  return useMemo(
    () => ({ ...navigation, navigateUp, reset }),
    [navigation, navigateUp, reset]
  );
}
