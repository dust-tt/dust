import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { AssistantBuilderMCPOrVizState } from "@app/components/assistant_builder/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SpaceType } from "@app/types";
import { assertNever } from "@app/types";

export const DISABLED_REASON =
  "Disabled as you cannot use more than one Space + the Company Space.";

type ActionType = AssistantBuilderMCPOrVizState | AgentBuilderAction;

export const getSpaceIdToActionsMap = (
  actions: ActionType[],
  mcpServerViews: MCPServerViewType[]
): Record<string, ActionType[]> => {
  return actions.reduce<Record<string, ActionType[]>>((acc, action) => {
    const addActionToSpace = (spaceId?: string) => {
      // We don't want to add the same action to the same space twice.
      if (spaceId && !acc[spaceId]?.some((a) => a.id === action.id)) {
        acc[spaceId] = (acc[spaceId] || []).concat(action);
      }
    };

    const actionType = action.type;

    switch (actionType) {
      case "MCP":
        if (action.configuration.dataSourceConfigurations) {
          Object.values(action.configuration.dataSourceConfigurations).forEach(
            (config) => {
              if (config) {
                addActionToSpace(config.dataSourceView.spaceId);
              }
            }
          );
        }

        if (action.configuration.tablesConfigurations) {
          Object.values(action.configuration.tablesConfigurations).forEach(
            (config) => {
              if (config) {
                addActionToSpace(config.dataSourceView.spaceId);
              }
            }
          );
        }

        if (action.configuration.mcpServerViewId) {
          const mcpServerView = mcpServerViews.find(
            (v) => v.sId === action.configuration.mcpServerViewId
          );

          if (mcpServerView && mcpServerView.server.availability === "manual") {
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
};

// Only allow one space across all actions + company data space.
export const getAllowedSpaces = ({
  action,
  spaces,
  spaceIdToActions,
}: {
  action?: AssistantBuilderMCPOrVizState | AgentBuilderAction;
  spaces: SpaceType[];
  spaceIdToActions: Record<
    string,
    (AssistantBuilderMCPOrVizState | AgentBuilderAction)[]
  >;
}) => {
  const isSpaceUsedInOtherActions = (space: SpaceType) => {
    const actionsUsingSpace = spaceIdToActions[space.sId] ?? [];
    return actionsUsingSpace.some((a) => {
      // We use the id to compare actions, as the configuration can change.
      return a.id !== action?.id;
    });
  };

  const usedSpacesInOtherActions = spaces.filter(
    (s) => s.kind !== "global" && isSpaceUsedInOtherActions(s)
  );
  if (usedSpacesInOtherActions.length === 0) {
    return spaces;
  }

  return spaces.filter(
    (space) =>
      space.kind === "global" ||
      usedSpacesInOtherActions.some((s) => s.sId === space.sId)
  );
};
