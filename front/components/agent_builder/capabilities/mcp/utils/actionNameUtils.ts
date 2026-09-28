import type { SelectedTool } from "@app/components/agent_builder/capabilities/shared/types";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";

interface GenerateUniqueActionNameParams {
  baseName: string;
  existingActions: BuilderAction[];
  selectedToolsInSheet?: SelectedTool[];
}

// Convert stored name back to user-friendly format for display
export function nameToDisplayFormat(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
    (action) => action.configuredAction?.name === newActionName
  );

  while (isNameUsedInAddedActions || isNameUsedInNonSavedActions) {
    newActionName = `${baseName.replace(/_\d+$/, "")}_${index}`;
    index += 1;
    isNameUsedInAddedActions = existingActions.some(
      (action) => action.name === newActionName
    );
    isNameUsedInNonSavedActions = selectedToolsInSheet.some(
      (action) => action.configuredAction?.name === newActionName
    );
  }

  return newActionName;
}
