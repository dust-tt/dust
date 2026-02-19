import { useSendNotification } from "@app/hooks/useNotification";
import { useSpaces } from "@app/lib/swr/spaces";
import type { ProjectType, SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { createContext, useContext, useEffect, useMemo } from "react";

interface SpacesContextType {
  owner: LightWorkspaceType;
  spaces: (SpaceType | ProjectType)[];
  isSpacesLoading: boolean;
  isSpacesError: boolean;
}

const SpacesContext = createContext<SpacesContextType | undefined>(undefined);

export const useSpacesContext = () => {
  const context = useContext(SpacesContext);
  if (!context) {
    throw new Error("useSpacesContext must be used within a SpacesProvider");
  }
  return context;
};

interface SpacesProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export const SpacesProvider = ({ owner, children }: SpacesProviderProps) => {
  const sendNotification = useSendNotification();
  const { spaces, isSpacesLoading, isSpacesError } = useSpaces({
    kinds: "all",
    workspaceId: owner.sId,
  });

  useEffect(() => {
    if (isSpacesError) {
      sendNotification({
        type: "error",
        title: "Failed to load spaces",
        description: "Unable to fetch workspace spaces. Please try again.",
      });
    }
  }, [isSpacesError, sendNotification]);

  const value: SpacesContextType = useMemo(
    () => ({
      owner,
      spaces,
      isSpacesLoading,
      isSpacesError,
    }),
    [owner, spaces, isSpacesLoading, isSpacesError]
  );

  return (
    <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>
  );
};

SpacesProvider.displayName = "SpacesProvider";
