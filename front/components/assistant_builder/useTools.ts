import { groupBy } from "lodash";
import { useContext, useMemo } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import type {
  ActionSpecificationWithType,
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionState,
  AssistantBuilderActionType,
  AssistantBuilderDataVisualizationConfiguration,
} from "@app/components/assistant_builder/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/utils";
import {
  ACTION_SPECIFICATIONS,
  DATA_VISUALIZATION_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SpaceType } from "@app/types";
import { asDisplayName } from "@app/types";

const DEFAULT_TOOLS_WITH_CONFIGURATION = [
  "DUST_APP_RUN",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const DEFAULT_TOOLS_WITHOUT_CONFIGURATION = [
  "REASONING",
  "DATA_VISUALIZATION",
] as const satisfies Array<
  | AssistantBuilderActionConfiguration["type"]
  | AssistantBuilderDataVisualizationConfiguration["type"]
>;

function getDefaultConfigurationSpecification(
  type: AssistantBuilderActionType | "DATA_VISUALIZATION"
): ActionSpecificationWithType {
  if (type === "DATA_VISUALIZATION") {
    return {
      type: "DATA_VISUALIZATION",
      ...DATA_VISUALIZATION_SPECIFICATION,
    };
  }

  return {
    type,
    ...ACTION_SPECIFICATIONS[type],
  };
}

function getAvailableNonMCPActions({
  enableReasoningTool,
}: {
  enableReasoningTool: boolean;
}) {
  // We should not show the option if it's already selected.
  const list = [
    ...DEFAULT_TOOLS_WITHOUT_CONFIGURATION,
    ...DEFAULT_TOOLS_WITH_CONFIGURATION,
  ].filter((tool) => {
    if (tool === "REASONING") {
      return enableReasoningTool;
    }

    return true;
  });

  return list.map((item) => getDefaultConfigurationSpecification(item));
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
    // There can be the same tool available in different spaces, in that case we need to show the space name.
    const displayName = asDisplayName(view.server.name);

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
    mcpServerViewsWithKnowledge: mcpServerViewsWithKnowledge || [],
    defaultMCPServerViews: grouped.auto || [],
    nonDefaultMCPServerViews: grouped.manual || [],
  };
}

interface UseToolsProps {
  enableReasoningTool: boolean;
  actions: AssistantBuilderActionState[];
}

export const useTools = ({ enableReasoningTool, actions }: UseToolsProps) => {
  const { mcpServerViews, spaces } = useContext(AssistantBuilderContext);

  const nonDefaultMCPActions = useMemo(
    () => getAvailableNonMCPActions({ enableReasoningTool }),
    [enableReasoningTool]
  );

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
        const isConfigurable = DEFAULT_TOOLS_WITH_CONFIGURATION.find(
          (defaultTool) => defaultTool === tool.type
        );

        // If it's not configurable, we need to remove it from the list
        if (!isConfigurable) {
          return !actions.some((action) => action.type === tool.type);
        }

        return true;
      }),
    [nonDefaultMCPActions, actions]
  );

  const selectableDefaultMCPServerViews = useMemo(
    () =>
      defaultMCPServerViews.filter((view) => {
        const selectedAction = actions.find(
          (action) => action.name === view.server.name
        );

        if (selectedAction) {
          return !selectedAction.noConfigurationRequired;
        }

        return true;
      }),
    [defaultMCPServerViews, actions]
  );

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
