import { useMemo } from "react";

import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import type {
  AssistantBuilderMCPOrVizState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { assertNever } from "@app/types";

export const isUsableAsCapability = (
  id: string,
  mcpServerViews: MCPServerViewType[]
) => {
  const view = mcpServerViews.find((v) => v.sId === id);
  if (!view) {
    return false;
  }
  return (
    view.server.availability === "auto" &&
    getMCPServerRequirements(view).noRequirement
  );
};

export const isUsableInKnowledge = (
  id: string,
  mcpServerViews: MCPServerViewType[]
) => {
  const view = mcpServerViews.find((v) => v.sId === id);
  if (!view) {
    return false;
  }
  return (
    view.server.availability === "auto" &&
    !isUsableAsCapability(id, mcpServerViews)
  );
};

export const useBuilderActionInfo = (builderState: AssistantBuilderState) => {
  const { spaces } = useSpacesContext();
  const { mcpServerViews } = useMCPServerViewsContext();

  const configurableActions = builderState.actions;

  const spaceIdToActions = useMemo(() => {
    return configurableActions.reduce<
      Record<string, AssistantBuilderMCPOrVizState[]>
    >((acc, action) => {
      const addActionToSpace = (spaceId?: string) => {
        if (spaceId) {
          acc[spaceId] = (acc[spaceId] || []).concat(action);
        }
      };

      const actionType = action.type;

      switch (actionType) {
        case "MCP":
          if (action.configuration.dataSourceConfigurations) {
            Object.values(
              action.configuration.dataSourceConfigurations
            ).forEach((config) => {
              addActionToSpace(config.dataSourceView.spaceId);
            });
          }

          if (action.configuration.tablesConfigurations) {
            Object.values(action.configuration.tablesConfigurations).forEach(
              (config) => {
                addActionToSpace(config.dataSourceView.spaceId);
              }
            );
          }

          if (action.configuration.mcpServerViewId) {
            const mcpServerView = mcpServerViews.find(
              (v) => v.sId === action.configuration.mcpServerViewId
            );
            // Default MCP server themselves are not accounted for in the space restriction.
            if (
              mcpServerView &&
              mcpServerView.server.availability === "manual"
            ) {
              addActionToSpace(mcpServerView.spaceId);
            }
          }
          break;

        case "DATA_VISUALIZATION": // Data visualization is not an action but we show it in the UI like an action.
          break;

        default:
          assertNever(actionType);
      }
      return acc;
    }, {});
  }, [configurableActions, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    return nonGlobalSpaces.filter((v) => spaceIdToActions[v.sId]?.length > 0);
  }, [spaceIdToActions, spaces]);

  return {
    configurableActions,
    nonGlobalSpacesUsedInActions,
    spaceIdToActions,
  };
};
