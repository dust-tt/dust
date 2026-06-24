import type { ContextSlashSearchSelection } from "@app/components/editor/extensions/shared/slash_suggestion/ContextSlashSearch";
import { ContextSlashSearch } from "@app/components/editor/extensions/shared/slash_suggestion/ContextSlashSearch";
import { computeHasChildren } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";

export interface KnowledgeSlashSearchProps {
  isNodeAttached?: (node: DataSourceViewContentNode) => boolean;
  onCancel: () => void;
  onSelect: (node: DataSourceViewContentNode) => void;
  owner: LightWorkspaceType;
  spaceId?: string | null;
}

export function KnowledgeSlashSearch({
  isNodeAttached,
  onCancel,
  onSelect,
  owner,
  spaceId,
}: KnowledgeSlashSearchProps) {
  const handleSelect = (selection: ContextSlashSearchSelection) => {
    if (selection.kind === "knowledge") {
      onSelect(selection.node);
    }
  };

  return (
    <ContextSlashSearch
      isNodeAttached={isNodeAttached}
      onCancel={onCancel}
      onSelect={handleSelect}
      owner={owner}
      useCase="skill-builder"
      spaceId={spaceId}
    />
  );
}

export function knowledgeNodeToItem(node: DataSourceViewContentNode) {
  return {
    dataSourceViewId: node.dataSourceView.sId,
    hasChildren: computeHasChildren(node),
    label: node.title,
    node,
    nodeId: node.internalId,
    spaceId: node.dataSourceView.spaceId,
  };
}
