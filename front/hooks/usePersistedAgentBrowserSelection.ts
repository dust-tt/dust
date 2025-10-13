import { useCallback, useMemo } from "react";

import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import { safeParseJSON } from "@app/types";

// We change the name of the metadata key to avoid conflicts with the old one, as we changed the way we store the data.
export const AGENT_BROWSER_SELECTION_METADATA_NAME = "agentBrowserSelection-2";

// workspaceId -> selected tag ids.
type AssistantBrowserSelectionStore = Record<string, string | null>;

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

  const selectedTagId = useMemo(() => {
    return store[workspaceId] ?? (null as string | null);
  }, [store, workspaceId]);

  const setSelectedTagId = useCallback(
    async (tagId: string | null) => {
      const next: AssistantBrowserSelectionStore = {
        ...store,
        [workspaceId]: tagId,
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
    selectedTagId,
    setSelectedTagId,
    isLoading: isMetadataLoading,
    isError: isMetadataError,
  };
};
