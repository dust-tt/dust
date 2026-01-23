import type { AgentBuilderMCPConfigurationWithId } from "@app/components/agent_builder/types";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";

type ActionType = AgentBuilderMCPConfigurationWithId | BuilderAction;

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

    return acc;
  }, {});
};
