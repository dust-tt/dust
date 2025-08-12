import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";

interface GenerateUniqueActionNameParams {
  baseName: string;
  existingActions: AgentBuilderAction[];
  selectedToolsInDialog?: SelectedTool[];
}

// TODO: refactor an make it reusable for mcp tools with data source selection.
export function generateUniqueActionName({
  baseName,
  existingActions,
  selectedToolsInDialog = [],
}: GenerateUniqueActionNameParams): string {
  let newActionName = baseName;
  let index = 2;

  let isNameUsedInAddedActions = existingActions.some(
    (action) => action.name === newActionName
  );
  let isNameUsedInNonSavedActions = selectedToolsInDialog.some(
    (action) =>
      action.type === "MCP" && action.configuredAction?.name === newActionName
  );

  while (isNameUsedInAddedActions || isNameUsedInNonSavedActions) {
    newActionName = `${baseName.replace(/_\d+$/, "")}_${index}`;
    index += 1;
    isNameUsedInAddedActions = existingActions.some(
      (action) => action.name === newActionName
    );
    isNameUsedInNonSavedActions = selectedToolsInDialog.some(
      (action) =>
        action.type === "MCP" && action.configuredAction?.name === newActionName
    );
  }

  return newActionName;
}
