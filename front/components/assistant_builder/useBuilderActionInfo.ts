import { useCallback, useContext, useMemo } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { assertNever } from "@app/types";

// Actions in this list are not configurable via the "add tool" menu.
// Instead, they should be handled in the `Capabilities` component.
// Note: not all capabilities are actions (eg: visualization)
const CAPABILITIES_ACTION_CATEGORIES = [
  "WEB_NAVIGATION",
  "REASONING",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

// We reserve the name we use for capability actions, as these aren't
// configurable via the "add tool" menu.
export const isReservedName = (name: string) =>
  CAPABILITIES_ACTION_CATEGORIES.some(
    (c) => getDefaultActionConfiguration(c)?.name === name
  );

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
  const { spaces, mcpServerViews } = useContext(AssistantBuilderContext);

  const isCapabilityAction = useCallback(
    (action: AssistantBuilderActionState) => {
      if (action.type === "MCP") {
        return isUsableAsCapability(
          action.configuration.mcpServerViewId,
          mcpServerViews
        );
      }

      return (CAPABILITIES_ACTION_CATEGORIES as string[]).includes(action.type);
    },
    [mcpServerViews]
  );

  const configurableActions = builderState.actions.filter(
    (a) => !isCapabilityAction(a)
  );

  const spaceIdToActions = useMemo(() => {
    return configurableActions.reduce<
      Record<string, AssistantBuilderActionState[]>
    >((acc, action) => {
      const addActionToSpace = (spaceId?: string) => {
        if (spaceId) {
          acc[spaceId] = (acc[spaceId] || []).concat(action);
        }
      };

      const actionType = action.type;

      switch (actionType) {
        case "TABLES_QUERY":
          Object.values(action.configuration).forEach((config) => {
            addActionToSpace(config.dataSourceView.spaceId);
          });
          break;

        case "RETRIEVAL_SEARCH":
        case "RETRIEVAL_EXHAUSTIVE":
        case "PROCESS":
          Object.values(action.configuration.dataSourceConfigurations).forEach(
            (config) => {
              addActionToSpace(config.dataSourceView.spaceId);
            }
          );
          break;

        case "DUST_APP_RUN":
          addActionToSpace(action.configuration.app?.space.sId);
          break;

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

        case "WEB_NAVIGATION":
        case "REASONING":
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
