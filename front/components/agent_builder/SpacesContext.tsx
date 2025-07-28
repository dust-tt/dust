import type { ReactNode } from "react";
import React, { createContext, useContext, useEffect, useMemo } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface SpacesContextType {
  spaces: SpaceType[];
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
      spaces,
      isSpacesLoading,
      isSpacesError,
    }),
    [spaces, isSpacesLoading, isSpacesError]
  );

  return (
    <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>
  );
};

SpacesProvider.displayName = "SpacesProvider";
