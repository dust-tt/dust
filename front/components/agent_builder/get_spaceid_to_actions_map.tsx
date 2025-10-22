import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { AssistantBuilderMCPConfigurationWithId } from "@app/components/assistant_builder/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { assertNever } from "@app/types";

type ActionType = AssistantBuilderMCPConfigurationWithId | AgentBuilderAction;

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

      default:
        assertNever(actionType);
    }
    return acc;
  }, {});
};
