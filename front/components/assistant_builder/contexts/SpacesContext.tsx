import React, { createContext, memo, useContext, type ReactNode } from "react";

import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface SpacesContextType {
  spaces: SpaceType[];
  isSpacesLoading: boolean;
  isSpacesError: boolean;
}

const SpacesContext = createContext<SpacesContextType>({
  spaces: [],
  isSpacesLoading: false,
  isSpacesError: false,
});

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

export const SpacesProvider = memo(
  ({ owner, children }: SpacesProviderProps) => {
    const { spaces, isSpacesLoading, isSpacesError } = useSpaces({
      workspaceId: owner.sId,
    });

    const value: SpacesContextType = {
      spaces,
      isSpacesLoading,
      isSpacesError,
    };

    return (
      <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>
    );
  }
);

SpacesProvider.displayName = "SpacesProvider";
