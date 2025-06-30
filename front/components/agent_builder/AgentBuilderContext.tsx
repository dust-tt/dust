import { createContext, useContext, useState } from "react";
import { useEffect } from "react";

import { MCPServerViewsProvider } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import type { SpaceType, WorkspaceType } from "@app/types";

type AgentBuilderContextType = {
  spaces: SpaceType[];
  owner: WorkspaceType;
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AgentBuilderContext = createContext<AgentBuilderContextType>({
  spaces: [],
  owner: {} as WorkspaceType,
  isPreviewPanelOpen: true,
  setIsPreviewPanelOpen: () => {},
});

interface AgentBuilderContextProps
  extends Omit<
    AgentBuilderContextType,
    "isPreviewPanelOpen" | "setIsPreviewPanelOpen"
  > {
  children: React.ReactNode;
}

export function AgentBuilderProvider({
  spaces,
  owner,
  children,
}: AgentBuilderContextProps) {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    // Set initial state based on screen size after hydration
    setIsPreviewPanelOpen(mediaQuery.matches);

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsPreviewPanelOpen(event.matches);
    };
    mediaQuery.addEventListener("change", handleMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);
  return (
    <AgentBuilderContext.Provider
      value={{
        spaces,
        owner,
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
      }}
    >
      <MCPServerViewsProvider owner={owner} spaces={spaces}>
        {children}
      </MCPServerViewsProvider>
    </AgentBuilderContext.Provider>
  );
}

export function useAgentBuilderContext() {
  const context = useContext(AgentBuilderContext);
  if (!context) {
    throw new Error(
      "useAgentBuilderContext must be used within an AgentBuilderProvider"
    );
  }
  return context;
}
