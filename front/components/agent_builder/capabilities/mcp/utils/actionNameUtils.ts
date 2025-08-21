import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";

interface GenerateUniqueActionNameParams {
  baseName: string;
  existingActions: AgentBuilderAction[];
  selectedToolsInSheet?: SelectedTool[];
}

// TODO: refactor an make it reusable for mcp tools with data source selection.
export function generateUniqueActionName({
  baseName,
  existingActions,
  selectedToolsInSheet = [],
}: GenerateUniqueActionNameParams): string {
  let newActionName = baseName;
  let index = 2;

  let isNameUsedInAddedActions = existingActions.some(
    (action) => action.name === newActionName
  );
  let isNameUsedInNonSavedActions = selectedToolsInSheet.some(
    (action) =>
      action.type === "MCP" && action.configuredAction?.name === newActionName
  );

  while (isNameUsedInAddedActions || isNameUsedInNonSavedActions) {
    newActionName = `${baseName.replace(/_\d+$/, "")}_${index}`;
    index += 1;
    isNameUsedInAddedActions = existingActions.some(
      (action) => action.name === newActionName
    );
    isNameUsedInNonSavedActions = selectedToolsInSheet.some(
      (action) =>
        action.type === "MCP" && action.configuredAction?.name === newActionName
    );
  }

  return newActionName;
}
