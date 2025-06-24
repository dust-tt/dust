import type { ReactNode } from "react";
import React, { createContext, memo, useContext, useEffect } from "react";

import { useSendNotification } from "@dust-tt/sparkle";

import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

import { useSpacesContext } from "./SpacesContext";

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

export const MCPServerViewsProvider = memo(
  ({ owner, children }: MCPServerViewsProviderProps) => {
    const { spaces } = useSpacesContext();
    const sendNotification = useSendNotification();

    const {
      serverViews: mcpServerViews,
      isLoading: isMCPServerViewsLoading,
      isError: isMCPServerViewsError,
    } = useMCPServerViewsFromSpaces(owner, spaces);

    useEffect(() => {
      if (isMCPServerViewsError) {
        sendNotification({
          type: "error",
          title: "Failed to load MCP servers",
          description: "Unable to fetch MCP server information. Please try again.",
        });
      }
    }, [isMCPServerViewsError, sendNotification]);

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
