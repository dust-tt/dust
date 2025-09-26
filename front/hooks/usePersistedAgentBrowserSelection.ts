import { useCallback, useMemo } from "react";

import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import { safeParseJSON } from "@app/types";

export const AGENT_BROWSER_SELECTION_METADATA_NAME = "agentBrowserSelection";

// workspaceId -> selected tag ids.
type AssistantBrowserSelectionStore = Record<string, string[]>;

export const usePersistedAgentBrowserSelection = (workspaceId: string) => {
  const { metadata, isMetadataLoading, isMetadataError, mutateMetadata } =
    useUserMetadata(AGENT_BROWSER_SELECTION_METADATA_NAME);

  const store: AssistantBrowserSelectionStore = useMemo(() => {
    if (metadata?.value) {
      const r = safeParseJSON(metadata.value);
      if (
        r.isOk() &&
        r.value &&
        typeof r.value === "object" &&
        !Array.isArray(r.value)
      ) {
        return r.value as AssistantBrowserSelectionStore;
      }
    }
    return {} as AssistantBrowserSelectionStore;
  }, [metadata]);

  const selectedTagIds = useMemo(() => {
    return store[workspaceId] ?? ([] as string[]);
  }, [store, workspaceId]);

  const setSelectedTagIds = useCallback(
    async (tagIds: string[]) => {
      const next: AssistantBrowserSelectionStore = {
        ...store,
        [workspaceId]: tagIds,
      };

      await setUserMetadataFromClient({
        key: AGENT_BROWSER_SELECTION_METADATA_NAME,
        value: JSON.stringify(next),
      });

      void mutateMetadata();
    },
    [mutateMetadata, store, workspaceId]
  );

  return {
    selectedTagIds,
    setSelectedTagIds,
    isLoading: isMetadataLoading,
    isError: isMetadataError,
  };
};
