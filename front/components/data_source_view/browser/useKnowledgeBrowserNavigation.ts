import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import { getKnowledgeBrowserEntryLabel } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import type { NavigationHistoryState } from "@app/components/data_source_view/context/useNavigationHistory";
import { useNavigationHistory } from "@app/components/data_source_view/context/useNavigationHistory";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { EnrichedSpaceType } from "@app/types/space";
import type { BreadcrumbsItem } from "@dust-tt/sparkle";
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

// One crumb per visible entry, each navigating back to its level. `getLabel` lets a surface keep
// its own wording for an entry (the Agent Builder shows a data source view's stored name).
export function getKnowledgeBrowserBreadcrumbItems(
  navigationHistory: NavigationHistoryEntryType[],
  navigateTo: (index: number) => void,
  getLabel: (
    entry: NavigationHistoryEntryType
  ) => string = getKnowledgeBrowserEntryLabel
): BreadcrumbsItem[] {
  return getVisibleNavigationEntries(navigationHistory).map(
    ({ entry, index }) => ({
      label: getLabel(entry),
      onClick: () => navigateTo(index),
    })
  );
}

type NavigationSetters = Pick<
  NavigationHistoryState,
  | "setSpaceEntry"
  | "setCategoryEntry"
  | "setDataSourceViewEntry"
  | "addNodeEntry"
>;

// Enters the level a browser row stands for.
export function navigateToKnowledgeBrowserItem(
  item: KnowledgeBrowserItem,
  navigation: NavigationSetters
): void {
  switch (item.kind) {
    case "space":
      navigation.setSpaceEntry(item.space);
      return;
    case "category":
      navigation.setCategoryEntry(item.category);
      return;
    case "data_source":
      navigation.setDataSourceViewEntry(item.dataSourceView);
      return;
    case "node":
      navigation.addNodeEntry(item.node);
      return;
    default:
      assertNeverAndIgnore(item);
  }
}

/**
 * @cc [owner:smb2268,label:product] browser-navigation-shortcuts
 * While enabled, a navigation offered exactly one space MUST enter that space, once per space (a
 * refetched list MUST NOT pull the user back into it), and a navigation sitting on a pod's space
 * level MUST enter its `managed` category, since pods only expose connected data. Disabled, the
 * hook MUST leave the navigation untouched.
 */
export function useKnowledgeBrowserShortcuts({
  navigation,
  spaces,
  enabled = true,
}: {
  navigation: Pick<
    NavigationHistoryState,
    "navigationHistory" | "setSpaceEntry" | "setCategoryEntry"
  >;
  spaces: EnrichedSpaceType[];
  // When false the shortcuts stay idle so a hidden browser never fetches a space.
  enabled?: boolean;
}): void {
  const { navigationHistory, setSpaceEntry, setCategoryEntry } = navigation;
  const currentEntry = navigationHistory[navigationHistory.length - 1];

  // Remembered so a refetched `spaces` array does not pull the user back to that space.
  const autoEnteredSpaceId = useRef<string | null>(null);
  useEffect(() => {
    const loneSpace = spaces.length === 1 ? spaces[0] : null;
    if (enabled && loneSpace && autoEnteredSpaceId.current !== loneSpace.sId) {
      autoEnteredSpaceId.current = loneSpace.sId;
      setSpaceEntry(loneSpace);
    }
  }, [enabled, spaces, setSpaceEntry]);

  useEffect(() => {
    if (
      enabled &&
      currentEntry.type === "space" &&
      currentEntry.space.kind === "project"
    ) {
      setCategoryEntry("managed");
    }
  }, [currentEntry, enabled, setCategoryEntry]);
}

// Navigation state for a knowledge browser with the shortcuts above, for callers that do not
// already own a navigation history (the Agent Builder's context does, and applies the shortcuts
// to it directly).
export function useKnowledgeBrowserNavigation({
  spaces,
  enabled = true,
}: {
  spaces: EnrichedSpaceType[];
  enabled?: boolean;
}): NavigationHistoryState & { navigateUp: () => void } {
  const navigation = useNavigationHistory();
  const { navigationHistory, navigateTo } = navigation;

  useKnowledgeBrowserShortcuts({ navigation, spaces, enabled });

  const navigateUp = useCallback(
    () => navigateTo(getNavigateUpIndex(navigationHistory)),
    [navigateTo, navigationHistory]
  );

  return useMemo(
    () => ({ ...navigation, navigateUp }),
    [navigation, navigateUp]
  );
}
