import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo } from "react";

import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useMCPServerConnections,
  useMCPServerViewsFromSpaces,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

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
  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
    connectionType: "workspace",
  });

  const sortedMCPServerViews = useMemo(() => {
    const sorted = mcpServerViews.sort(mcpServerViewSortingFn);
    const connectedIds = new Set(
      connections.map((c) => c.internalMCPServerId ?? `${c.remoteMCPServerId}`)
    );
    return sorted.filter((view) => {
      if (!view.server.authorization) {
        return true;
      }

      if (!view.oAuthUseCase) {
        return true;
      }

      if (view.oAuthUseCase === "personal_actions") {
        return true;
      } else if (view.oAuthUseCase === "platform_actions") {
        return connectedIds.has(view.server.sId);
      } else {
        assertNever(view.oAuthUseCase);
      }
    });
  }, [connections, mcpServerViews]);

  const value: MCPServerViewsContextType = useMemo(() => {
    return {
      mcpServerViews: sortedMCPServerViews,
      isMCPServerViewsLoading:
        isLoading || isSpacesLoading || isConnectionsLoading,
      isMCPServerViewsError,
    };
  }, [
    isLoading,
    isMCPServerViewsError,
    isSpacesLoading,
    sortedMCPServerViews,
    isConnectionsLoading,
  ]);

  return (
    <MCPServerViewsContext.Provider value={value}>
      {children}
    </MCPServerViewsContext.Provider>
  );
};

MCPServerViewsProvider.displayName = "MCPServerViewsProvider";
