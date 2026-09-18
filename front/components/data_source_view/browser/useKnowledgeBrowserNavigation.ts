import type { NavigationHistoryState } from "@app/components/data_source_view/context/useNavigationHistory";
import { useNavigationHistory } from "@app/components/data_source_view/context/useNavigationHistory";
import type { EnrichedSpaceType } from "@app/types/space";
import { useEffect, useRef } from "react";

// Navigation state for a knowledge browser, with the Agent Builder's shortcuts: a lone space is
// entered directly and pods skip the category level since they only expose connected data.
export function useKnowledgeBrowserNavigation({
  spaces,
  enabled = true,
}: {
  spaces: EnrichedSpaceType[];
  // When false the shortcuts stay idle so a hidden browser never fetches a space.
  enabled?: boolean;
}): NavigationHistoryState {
  const navigation = useNavigationHistory();
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

  return navigation;
}
