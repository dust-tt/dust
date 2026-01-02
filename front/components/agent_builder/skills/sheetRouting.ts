import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";

import type { ConfigurationState, InfoState, KnowledgeState } from "./types";

export function getKnowledgeMCPServerViewForAction(
  action: BuilderAction,
  mcpServerViewsWithKnowledge: MCPServerViewTypeWithLabel[]
): MCPServerViewTypeWithLabel | null {
  return (
    mcpServerViewsWithKnowledge.find(
      (view) => view.sId === action.configuration?.mcpServerViewId
    ) ?? null
  );
}

export function getNonKnowledgeMCPServerViewForAction(
  action: BuilderAction,
  mcpServerViewsWithoutKnowledge: MCPServerViewTypeWithLabel[]
): MCPServerViewTypeWithLabel | null {
  return (
    mcpServerViewsWithoutKnowledge.find(
      (view) => view.sId === action.configuration?.mcpServerViewId
    ) ?? null
  );
}

export function getSheetStateForActionEdit({
  action,
  index,
  mcpServerViewsWithKnowledge,
  mcpServerViewsWithoutKnowledge,
}: {
  action: BuilderAction;
  index: number;
  mcpServerViewsWithKnowledge: MCPServerViewTypeWithLabel[];
  mcpServerViewsWithoutKnowledge: MCPServerViewTypeWithLabel[];
}): KnowledgeState | ConfigurationState | InfoState<"tool", BuilderAction> {
  const knowledgeView = getKnowledgeMCPServerViewForAction(
    action,
    mcpServerViewsWithKnowledge
  );

  if (knowledgeView) {
    return { state: "knowledge", action, index };
  }

  const toolView = getNonKnowledgeMCPServerViewForAction(
    action,
    mcpServerViewsWithoutKnowledge
  );

  if (action.configurationRequired && toolView) {
    return {
      state: "configuration",
      capability: action,
      mcpServerView: toolView,
      index,
    };
  }

  return {
    state: "info",
    kind: "tool",
    capability: action,
    hasPreviousPage: false,
  };
}
