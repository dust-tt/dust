import groupBy from "lodash/groupBy";
import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo } from "react";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import {
  getMcpServerViewDisplayName,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, SpaceType } from "@app/types";

export type MCPServerViewTypeWithLabel = MCPServerViewType & { label: string };

// Sort MCP server views based on priority order.
// Order: Search -> Include Data -> Query Tables -> Extract Data -> Others (alphabetically).
export const sortMCPServerViewsByPriority = (
  views: MCPServerViewTypeWithLabel[]
): MCPServerViewTypeWithLabel[] => {
  const priorityOrder: Record<string, number> = {
    search: 1,
    query_tables: 2,
    query_tables_v2: 2, // Same priority as query_tables
    include_data: 3,
    extract_data: 4,
  };

  return [...views].sort((a, b) => {
    const priorityA = priorityOrder[a.server.name] ?? 999;
    const priorityB = priorityOrder[b.server.name] ?? 999;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // If priorities are the same, sort alphabetically by label.
    return a.label.localeCompare(b.label);
  });
};

interface MCPServerViewsContextType {
  mcpServerViews: MCPServerViewType[];
  mcpServerViewsWithKnowledge: MCPServerViewTypeWithLabel[];
  defaultMCPServerViews: MCPServerViewTypeWithLabel[];
  nonDefaultMCPServerViews: MCPServerViewTypeWithLabel[];
  isMCPServerViewsLoading: boolean;
  isMCPServerViewsError: boolean;
}

const MCPServerViewsContext = createContext<
  MCPServerViewsContextType | undefined
>(undefined);

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
      const toolsConfigurations = getMCPServerToolsConfigurations(view);

      // Special handling for content_creation server:
      // The content_creation server includes list and cat tools for convenience, but its primary purpose is
      // not data source operations. We don't want it to be classified as requiring knowledge.
      const isContentCreationServer = view.server.name === "content_creation";

      const isWithKnowledge =
        !isContentCreationServer &&
        (toolsConfigurations.dataSourceConfiguration ??
          toolsConfigurations.dataWarehouseConfiguration ??
          toolsConfigurations.tableConfiguration ??
          false);

      return isWithKnowledge
        ? "mcpServerViewsWithKnowledge"
        : "mcpServerViewsWithoutKnowledge";
    });

  const grouped = groupBy(
    mcpServerViewsWithoutKnowledge,
    (view) => view.server.availability
  );

  return {
    mcpServerViewsWithKnowledge: sortMCPServerViewsByPriority(
      mcpServerViewsWithKnowledge || []
    ),
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

  const {
    serverViews: mcpServerViews,
    isLoading,
    isError: isMCPServerViewsError,
  } = useMCPServerViewsFromSpaces(owner, spaces, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });

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
