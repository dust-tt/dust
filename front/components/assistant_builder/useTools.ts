import { groupBy } from "lodash";
import { useContext, useMemo } from "react";
import { useCallback } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import type {
  ActionSpecificationWithType,
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionState,
  AssistantBuilderActionType,
  AssistantBuilderDataVisualizationConfiguration,
} from "@app/components/assistant_builder/types";
import { ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME } from "@app/components/assistant_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/utils";
import {
  ACTION_SPECIFICATIONS,
  DATA_VISUALIZATION_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { ModelConfigurationType, SpaceType } from "@app/types";

const DEFAULT_TOOLS_WITH_CONFIGURATION = [
  "DUST_APP_RUN",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const DEFAULT_TOOLS_WITHOUT_CONFIGURATION = [
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

function getAvailableNonMCPActions() {
  // We should not show the option if it's already selected.
  const list = [
    ...DEFAULT_TOOLS_WITHOUT_CONFIGURATION,
    ...DEFAULT_TOOLS_WITH_CONFIGURATION,
  ];

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
    mcpServerViewsWithKnowledge: mcpServerViewsWithKnowledge || [],
    defaultMCPServerViews: grouped.auto || [],
    nonDefaultMCPServerViews: grouped.manual || [],
  };
}

interface UseToolsProps {
  actions: AssistantBuilderActionState[];
  reasoningModels: ModelConfigurationType[];
}

export const useTools = ({ actions, reasoningModels }: UseToolsProps) => {
  const { mcpServerViews, spaces } = useContext(AssistantBuilderContext);

  const hideAction = useCallback(
    (key: ActionSpecificationWithType) => {
      switch (key.type) {
        case "DUST_APP_RUN":
          return mcpServerViews.some((v) => {
            const r = getInternalMCPServerNameAndWorkspaceId(v.server.sId);
            return (
              r.isOk() &&
              r.value.name ===
                ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME
            );
          });
        default:
          return false;
      }
    },
    [mcpServerViews]
  );

  const nonDefaultMCPActions = useMemo(
    () => getAvailableNonMCPActions().filter((a) => !hideAction(a)),
    [hideAction]
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
