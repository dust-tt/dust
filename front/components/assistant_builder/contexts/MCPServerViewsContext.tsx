import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo } from "react";

import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

interface MCPServerViewsContextType {
  mcpServerViews: MCPServerViewType[];
  isMCPServerViewsLoading: boolean;
  isMCPServerViewsError: boolean;
}

const MCPServerViewsContext = createContext<MCPServerViewsContextType>({
  mcpServerViews: [],
  isMCPServerViewsLoading: false,
  isMCPServerViewsError: false,
});

export const useMCPServerViewsContext = () => {
  const context = useContext(MCPServerViewsContext);
  if (!context) {
    throw new Error(
      "useMCPServerViewsContext must be used within a MCPServerViewsProvider"
    );
  }
  return context;
};

interface MCPServerViewsProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export const MCPServerViewsProvider = ({
  owner,
  children,
}: MCPServerViewsProviderProps) => {
  const { spaces, isSpacesLoading } = useSpacesContext();

  // TODO: we should only fetch it on mount.
  const {
    serverViews: mcpServerViews,
    isLoading,
    isError: isMCPServerViewsError,
  } = useMCPServerViewsFromSpaces(owner, spaces);

  const sortedMCPServerViews = useMemo(
    () => mcpServerViews.sort(mcpServerViewSortingFn),
    [mcpServerViews]
  );

  const value: MCPServerViewsContextType = useMemo(() => {
    return {
      mcpServerViews: sortedMCPServerViews,
      isMCPServerViewsLoading: isLoading || isSpacesLoading, // Spaces is required to fetch server views so we check isSpacesLoading too.
      isMCPServerViewsError,
    };
  }, [isLoading, isMCPServerViewsError, isSpacesLoading, sortedMCPServerViews]);

  return (
    <MCPServerViewsContext.Provider value={value}>
      {children}
    </MCPServerViewsContext.Provider>
  );
};

MCPServerViewsProvider.displayName = "MCPServerViewsProvider";
