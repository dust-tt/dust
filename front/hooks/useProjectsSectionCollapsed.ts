import { useCallback } from "react";

import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";

const PROJECTS_SECTION_COLLAPSED_KEY = "projectsSectionCollapsed";

export const useProjectsSectionCollapsed = () => {
  const { metadata, isMetadataLoading, mutateMetadata } = useUserMetadata(
    PROJECTS_SECTION_COLLAPSED_KEY,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  // Default to open (not collapsed) if no metadata exists yet.
  const isProjectsSectionCollapsed = metadata?.value === "true";

  const setProjectsSectionCollapsed = useCallback(
    async (collapsed: boolean) => {
      await setUserMetadataFromClient({
        key: PROJECTS_SECTION_COLLAPSED_KEY,
        value: collapsed ? "true" : "false",
      });
      void mutateMetadata();
    },
    [mutateMetadata]
  );

  return {
    isProjectsSectionCollapsed,
    setProjectsSectionCollapsed,
    isLoading: isMetadataLoading,
  };
};
