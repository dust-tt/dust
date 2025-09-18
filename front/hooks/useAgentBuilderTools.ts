import groupBy from "lodash/groupBy";
import { useMemo } from "react";

import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

function getGroupedMCPServerViews({
  mcpServerViews,
  spaces,
}: {
  mcpServerViews: MCPServerViewType[];
  spaces: any[];
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

      const isWithKnowledge =
        toolsConfigurations.dataSourceConfiguration ??
        toolsConfigurations.dataWarehouseConfiguration ??
        toolsConfigurations.tableConfiguration ??
        false;

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

export const useAgentBuilderTools = () => {
  const { spaces } = useSpacesContext();
  const { mcpServerViews } = useMCPServerViewsContext();

  const {
    mcpServerViewsWithKnowledge,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
  } = useMemo(() => {
    return getGroupedMCPServerViews({ mcpServerViews, spaces });
  }, [mcpServerViews, spaces]);

  return {
    mcpServerViewsWithKnowledge,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
  };
};
