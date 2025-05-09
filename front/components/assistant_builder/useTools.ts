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
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  ACTION_SPECIFICATIONS,
  DATA_VISUALIZATION_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types";

const DEFAULT_TOOLS_WITH_CONFIGURATION = [
  "DUST_APP_RUN",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const DEFAULT_TOOLS_WITHOUT_CONFIGURATION = [
  "REASONING",
  "WEB_NAVIGATION",
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

function getDefaultTools({
  enableReasoningTool,
  isWebNavigationEnabled,
  mcpServerViews,
}: {
  enableReasoningTool: boolean;
  isWebNavigationEnabled: boolean;
  mcpServerViews: MCPServerViewType[];
}) {
  // We should not show the option if it's already selected.
  const list = [
    ...DEFAULT_TOOLS_WITHOUT_CONFIGURATION,
    ...DEFAULT_TOOLS_WITH_CONFIGURATION,
  ].filter((tool) => {
    if (tool === "REASONING") {
      return enableReasoningTool;
    }

    // Users should see the old web Capabilities only if
    // their agents has it selected in the past or
    // if they don't have mcp_actions activated.
    if (tool === "WEB_NAVIGATION") {
      // this is to catch any changes in the name
      const webtoolsV2ServerName: InternalMCPServerNameType =
        "web_search_&_browse_v2";

      const webtoolsServer = mcpServerViews.find(
        (view) => view.server.name === webtoolsV2ServerName
      );

      if (webtoolsServer != null) {
        return isWebNavigationEnabled;
      }

      return true;
    }

    return true;
  });

  return list.map((item) => getDefaultConfigurationSpecification(item));
}

function getMCPServerViews({
  mcpServerViews,
}: {
  mcpServerViews: MCPServerViewType[];
}) {
  const mcpServerViewsWithLabel = mcpServerViews.map((view) => ({
    ...view,
    label: asDisplayName(view.server.name),
  }));

  const grouped = groupBy(
    mcpServerViewsWithLabel,
    (view) => view.server.availability
  );

  return {
    defaultMCPServerViews: grouped.auto || [],
    nonDefaultMCPServerViews: grouped.manual || [],
  };
}

interface UseToolsProps {
  enableReasoningTool: boolean;
  actions: AssistantBuilderActionState[];
}

export const useTools = ({ enableReasoningTool, actions }: UseToolsProps) => {
  const { mcpServerViews, initialActions } = useContext(
    AssistantBuilderContext
  );

  const isWebNavigationEnabled = useMemo(() => {
    return !!initialActions.find((a) => a.type === "WEB_NAVIGATION");
  }, [initialActions]);

  const defaultTools = useMemo(() => {
    return getDefaultTools({
      enableReasoningTool,
      isWebNavigationEnabled,
      mcpServerViews,
    });
  }, [enableReasoningTool, isWebNavigationEnabled, mcpServerViews]);

  const { defaultMCPServerViews, nonDefaultMCPServerViews } = useMemo(
    () => getMCPServerViews({ mcpServerViews }),
    [mcpServerViews]
  );

  const selectableDefaultTools = useMemo(
    () =>
      defaultTools.filter((tool) => {
        const isConfigurable = DEFAULT_TOOLS_WITH_CONFIGURATION.find(
          (defaultTool) => defaultTool === tool.type
        );

        // If it's not configurable, we need to remove it from the list
        if (!isConfigurable) {
          return !actions.some((action) => action.type === tool.type);
        }

        return true;
      }),
    [defaultTools, actions]
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
    selectableDefaultTools,
    selectableDefaultMCPServerViews,
    selectableNonDefaultMCPServerViews,
  };
};
