import { groupBy } from "lodash";
import { useMemo } from "react";

import { sortMCPServerViewsByPriority } from "@app/components/agent_builder/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import type {
  ActionSpecificationWithType,
  AssistantBuilderDataVisualizationConfiguration,
  AssistantBuilderMCPConfiguration,
  AssistantBuilderMCPOrVizState,
  AssistantBuilderMCPServerType,
} from "@app/components/assistant_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import {
  DATA_VISUALIZATION_SPECIFICATION,
  MCP_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { ModelConfigurationType, SpaceType } from "@app/types";

const DEFAULT_TOOLS_WITHOUT_CONFIGURATION = [
  "DATA_VISUALIZATION",
] as const satisfies Array<
  | AssistantBuilderMCPConfiguration["type"]
  | AssistantBuilderDataVisualizationConfiguration["type"]
>;

function getDefaultConfigurationSpecification(
  type: AssistantBuilderMCPServerType | "DATA_VISUALIZATION"
): ActionSpecificationWithType {
  if (type === "DATA_VISUALIZATION") {
    return {
      type: "DATA_VISUALIZATION",
      ...DATA_VISUALIZATION_SPECIFICATION,
    };
  }

  return {
    type,
    ...MCP_SPECIFICATION,
  };
}

function getAvailableNonMCPActions() {
  // We should not show the option if it's already selected.

  return DEFAULT_TOOLS_WITHOUT_CONFIGURATION.map((item) =>
    getDefaultConfigurationSpecification(item)
  );
}

function getGroupedMCPServerViews({
  mcpServerViews,
  spaces,
}: {
  mcpServerViews: MCPServerViewType[];
  spaces: SpaceType[];
}) {
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

  // We show the MCP actions with data sources in Knowledge dropdown,
  // and the ones without data sources in Tools dropdown.
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
    mcpServerViewsWithKnowledge: sortMCPServerViewsByPriority(
      mcpServerViewsWithKnowledge || []
    ),
    defaultMCPServerViews: grouped.auto || [],
    nonDefaultMCPServerViews: grouped.manual || [],
  };
}

interface UseToolsProps {
  actions: AssistantBuilderMCPOrVizState[];
  reasoningModels: ModelConfigurationType[];
}

export const useTools = ({ actions, reasoningModels }: UseToolsProps) => {
  const { spaces } = useSpacesContext();
  const { mcpServerViews } = useMCPServerViewsContext();

  const nonDefaultMCPActions = getAvailableNonMCPActions();

  const {
    mcpServerViewsWithKnowledge,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
  } = useMemo(() => {
    return getGroupedMCPServerViews({ mcpServerViews, spaces });
  }, [mcpServerViews, spaces]);

  const selectableNonMCPActions = useMemo(
    () =>
      nonDefaultMCPActions.filter((tool) => {
        return !actions.some((action) => action.type === tool.type);
      }),
    [nonDefaultMCPActions, actions]
  );

  const hasReasoningModel = reasoningModels.length > 0;

  const selectableDefaultMCPServerViews = useMemo(() => {
    const filteredList = defaultMCPServerViews.filter((view) => {
      const selectedAction = actions.find(
        (action) => action.name === view.server.name
      );

      if (selectedAction) {
        return !selectedAction.noConfigurationRequired;
      }

      return true;
    });

    if (hasReasoningModel) {
      return filteredList;
    }

    // You should not be able to select Reasoning if there is no reasoning model available.
    return filteredList.filter(
      (view) => !getMCPServerRequirements(view).requiresReasoningConfiguration
    );
  }, [defaultMCPServerViews, actions, hasReasoningModel]);

  const selectableNonDefaultMCPServerViews = useMemo(
    () =>
      nonDefaultMCPServerViews.filter((view) => {
        const selectedAction = actions.find(
          (action) => action.name === view.server.name
        );

        if (selectedAction) {
          return !selectedAction.noConfigurationRequired;
        }

        return true;
      }),
    [nonDefaultMCPServerViews, actions]
  );

  return {
    mcpServerViewsWithKnowledge, // All of them require configuration so no need to filter out the selected ones.
    selectableNonMCPActions,
    selectableDefaultMCPServerViews,
    selectableNonDefaultMCPServerViews,
  };
};
