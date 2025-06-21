import React, { createContext, memo, useContext, type ReactNode } from "react";

import type { AppType, LightWorkspaceType } from "@app/types";

interface DustAppsContextType {
  dustApps: AppType[];
  isDustAppsLoading: boolean;
  isDustAppsError: boolean;
}

const DustAppsContext = createContext<DustAppsContextType>({
  dustApps: [],
  isDustAppsLoading: false,
  isDustAppsError: false,
});

export const useDustAppsContext = () => {
  const context = useContext(DustAppsContext);
  if (!context) {
    throw new Error(
      "useDustAppsContext must be used within a DustAppsProvider"
    );
  }
  return context;
};

interface DustAppsProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export const DustAppsProvider = memo(
  ({ owner, children }: DustAppsProviderProps) => {
    const value: DustAppsContextType = {
      dustApps: [],
      isDustAppsLoading: false,
      isDustAppsError: false,
    };

    return (
      <DustAppsContext.Provider value={value}>
        {children}
      </DustAppsContext.Provider>
    );
  }
);

DustAppsProvider.displayName = "DustAppsProvider";
