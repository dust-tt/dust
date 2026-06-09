import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { KnowledgeNodeView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type React from "react";

const KNOWLEDGE_CHIP_CLASS =
  "inline-flex items-center gap-0.5 border border-current/40 rounded px-0.5 text-xs leading-tight";
const DOCUMENT_ICON = "📄";

const KnowledgeNodeReadOnlyView: React.FC<NodeViewProps> = ({ node }) => {
  const { selectedItems } = node.attrs;
  const item = selectedItems[0] as KnowledgeItem | undefined;
  if (!item) {
    return null;
  }
  // No background or explicit color so diff decorations act on the content directly
  return (
    <NodeViewWrapper as="span" className={KNOWLEDGE_CHIP_CLASS}>
      <span>{DOCUMENT_ICON}</span>
      <span>{` ${item.label}`}</span>
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
