import { createContext, useState } from "react";
import { useEffect } from "react";

import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import type { AppType, SpaceType, WorkspaceType } from "@app/types";

import { MCPServerViewsProvider } from "./contexts/MCPServerViewsContext";

type AssistantBuilderContextType = {
  dustApps: AppType[];
  spaces: SpaceType[];
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dustApps: [],
    spaces: [],
    isPreviewPanelOpen: true,
    setIsPreviewPanelOpen: () => {},
  });

interface AssistantBuilderProviderProps {
  owner: WorkspaceType;
  dustApps: AppType[];
  spaces: SpaceType[];
  children: React.ReactNode;
}

export function AssistantBuilderProvider({
  owner,
  dustApps,
  spaces,
  children,
}: AssistantBuilderProviderProps) {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsPreviewPanelOpen(event.matches);
    };
    mediaQuery.addEventListener("change", handleMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  return (
    <AssistantBuilderContext.Provider
      value={{
        dustApps,
        spaces,
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
      }}
    >
      <MCPServerViewsProvider owner={owner} spaces={spaces}>
        <DataSourceViewsProvider owner={owner}>
          {children}
        </DataSourceViewsProvider>
      </MCPServerViewsProvider>
    </AssistantBuilderContext.Provider>
  );
}
