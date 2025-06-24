import type { ReactNode } from "react";
import React, { createContext, memo, useContext } from "react";

import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, SpaceType } from "@app/types";
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
  spaces: SpaceType[];
  children: ReactNode;
}

export const MCPServerViewsProvider = memo(
  ({ owner, spaces, children }: MCPServerViewsProviderProps) => {
    const {
      serverViews: mcpServerViews,
      isLoading: isMCPServerViewsLoading,
      isError: isMCPServerViewsError,
    } = useMCPServerViewsFromSpaces(owner, spaces);

    const value: MCPServerViewsContextType = {
      mcpServerViews: mcpServerViews.sort(mcpServerViewSortingFn),
      isMCPServerViewsLoading,
      isMCPServerViewsError,
    };

    return (
      <MCPServerViewsContext.Provider value={value}>
        {children}
      </MCPServerViewsContext.Provider>
    );
  }
);

MCPServerViewsProvider.displayName = "MCPServerViewsProvider";
