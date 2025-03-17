import { useCallback, useMemo } from "react";

import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import { safeParseJSON } from "@app/types";

// client-side counterpart of persisted_navigation_selection.ts

export type NavigationSelectionType = {
  lastWorkspaceId?: string;
  lastSpaceId?: string;
};

export const NAVIGATION_SELECTION_METADATA_NAME = "navigationSelection";

export const usePersistedNavigationSelection = () => {
  const { metadata, isMetadataLoading, isMetadataError, mutateMetadata } =
    useUserMetadata(NAVIGATION_SELECTION_METADATA_NAME);

  const navigationSelection = useMemo(() => {
    if (metadata) {
      const r = safeParseJSON(metadata?.value);

      if (r.isOk() && r.value) {
        const selection: NavigationSelectionType = r.value;
        return {
          lastWorkspaceId: selection.lastWorkspaceId,
          lastSpaceId: selection.lastSpaceId,
        } as NavigationSelectionType;
      }
    }

    return {};
  }, [metadata]);

  const setNavigationSelection = useCallback(
    async (selection: NavigationSelectionType) => {
      const existingSelection = navigationSelection;

      const newSelection: NavigationSelectionType = {
        ...existingSelection,
        ...selection,
      };

      await setUserMetadataFromClient({
        key: NAVIGATION_SELECTION_METADATA_NAME,
        value: JSON.stringify(newSelection),
      });

      void mutateMetadata();
    },
    [mutateMetadata, navigationSelection]
  );

  return {
    setNavigationSelection,
    navigationSelection,
    isLoading: isMetadataLoading,
    isError: isMetadataError,
  };
};
