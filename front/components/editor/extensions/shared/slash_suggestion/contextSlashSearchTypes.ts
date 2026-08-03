import type { ContextFileSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/ContextFileSlashSearch";
import { isContextFileSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/ContextFileSlashSearch";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";

export type ContextSlashSearchSelection =
  | {
      kind: "file";
      selection: ContextFileSlashSearchSelection;
    }
  | {
      kind: "knowledge";
      node: DataSourceViewContentNode;
    };

export type ContextSlashSearchUseCase = "conversation-input" | "skill-builder";

function isContextSlashSearchKnowledgeNode(
  value: unknown
): value is DataSourceViewContentNode {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "internalId" in value &&
    "dataSourceView" in value &&
    value.dataSourceView != null &&
    typeof value.dataSourceView === "object"
  );
}

export function isContextSlashSearchSelection(
  value: unknown
): value is ContextSlashSearchSelection {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return false;
  }

  if (value.kind === "file") {
    return (
      "selection" in value && isContextFileSlashSearchSelection(value.selection)
    );
  }

  if (value.kind === "knowledge") {
    return "node" in value && isContextSlashSearchKnowledgeNode(value.node);
  }

  return false;
}
