import { groupBy } from "lodash";
import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo } from "react";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import {
  getMcpServerViewDisplayName,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type MCPServerViewTypeWithLabel = MCPServerViewType & { label: string };

interface MCPServerViewsContextType {
  mcpServerViews: MCPServerViewType[];
  mcpServerViewsWithKnowledge: MCPServerViewTypeWithLabel[];
  defaultMCPServerViews: MCPServerViewTypeWithLabel[];
  nonDefaultMCPServerViews: MCPServerViewTypeWithLabel[];
  isMCPServerViewsLoading: boolean;
  isMCPServerViewsError: boolean;
}

const MCPServerViewsContext = createContext<MCPServerViewsContextType>({
  mcpServerViews: [],
  mcpServerViewsWithKnowledge: [],
  defaultMCPServerViews: [],
  nonDefaultMCPServerViews: [],
  isMCPServerViewsLoading: false,
  isMCPServerViewsError: false,
});

function getGroupedMCPServerViews({
  mcpServerViews,
  spaces,
}: {
  mcpServerViews: MCPServerViewType[];
  spaces: SpaceType[];
}) {
  if (!mcpServerViews || !Array.isArray(mcpServerViews)) {
    return {
      mcpServerViewsWithKnowledge: [],
      defaultMCPServerViews: [],
      nonDefaultMCPServerViews: [],
    };
  }

  const serverIdToCount = mcpServerViews.reduce(
    (acc, view) => {
      acc[view.server.sId] = (acc[view.server.sId] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const mcpServerViewsWithLabel = mcpServerViews.map((view) => {
    const displayName = getMcpServerViewDisplayName(view);

    // There can be the same tool available in different spaces, in that case we need to show the space name.
    if (serverIdToCount[view.server.sId] > 1) {
      const spaceName = spaces.find(
        (space) => space.sId === view.spaceId
      )?.name;

      if (spaceName) {
        return {
          ...view,
          label: `${displayName} (${spaceName})`,
        };
      }
    }

    return {
      ...view,
      label: displayName,
    };
  });

  const { mcpServerViewsWithKnowledge, mcpServerViewsWithoutKnowledge } =
    groupBy(mcpServerViewsWithLabel, (view) => {
      const requirements = getMCPServerRequirements(view);

      const isWithKnowledge =
        requirements.requiresDataSourceConfiguration ||
        requirements.requiresTableConfiguration;

      return isWithKnowledge
        ? "mcpServerViewsWithKnowledge"
        : "mcpServerViewsWithoutKnowledge";
    });

  const grouped = groupBy(
    mcpServerViewsWithoutKnowledge,
    (view) => view.server.availability
  );

  return {
    mcpServerViewsWithKnowledge: mcpServerViewsWithKnowledge || [],
    defaultMCPServerViews: grouped.auto || [],
    nonDefaultMCPServerViews: grouped.manual || [],
  };
}

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

  const {
    mcpServerViewsWithKnowledge,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
  } = useMemo(() => {
    return getGroupedMCPServerViews({
      mcpServerViews: sortedMCPServerViews,
      spaces,
    });
  }, [sortedMCPServerViews, spaces]);

  const value: MCPServerViewsContextType = useMemo(() => {
    return {
      mcpServerViews: sortedMCPServerViews,
      mcpServerViewsWithKnowledge,
      defaultMCPServerViews,
      nonDefaultMCPServerViews,
      isMCPServerViewsLoading: isLoading || isSpacesLoading, // Spaces is required to fetch server views so we check isSpacesLoading too.
      isMCPServerViewsError,
    };
  }, [
    sortedMCPServerViews,
    mcpServerViewsWithKnowledge,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
    isLoading,
    isMCPServerViewsError,
    isSpacesLoading,
  ]);

  return (
    <MCPServerViewsContext.Provider value={value}>
      {children}
    </MCPServerViewsContext.Provider>
  );
};

MCPServerViewsProvider.displayName = "MCPServerViewsProvider";
