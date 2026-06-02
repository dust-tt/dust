import { KnowledgeChip } from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import {
  isFullKnowledgeItem,
  type KnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { KnowledgeNodeView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { AttachmentChip, DocumentIcon } from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type React from "react";

const KnowledgeNodeReadOnlyView: React.FC<NodeViewProps> = ({ node }) => {
  const { selectedItems } = node.attrs;
  const item = selectedItems[0] as KnowledgeItem | undefined;
  if (!item) {
    return null;
  }

  return (
    <NodeViewWrapper className="inline">
      {isFullKnowledgeItem(item) ? (
        <KnowledgeChip node={item.node} title={item.label} />
      ) : (
        <AttachmentChip
          label={item.label}
          icon={{ visual: DocumentIcon }}
          color="white"
          size="xs"
        />
      )}
    </NodeViewWrapper>
  );
};

export const KnowledgeNodeWithView = KnowledgeNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(
      this.options.readOnly ? KnowledgeNodeReadOnlyView : KnowledgeNodeView
    );
  },
});
