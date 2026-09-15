import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import { AttachmentChip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

interface KnowledgeNodeComponentProps {
  node: { attrs: { selectedItems?: KnowledgeItem[] } };
}

// Inline chip rendered for a <knowledge> node in the conversation input bar.
// The picker inserts the node with a fully-resolved item, so unlike the skill
// builder variant this chip never needs to fetch — it only displays the label.
// Removal is driven by the attachment card (mirroring dataSourceLink), which
// removes the chip through the sync effect in InputBarContainer.
export const KnowledgeNodeComponent = ({
  node,
}: KnowledgeNodeComponentProps) => {
  const item = node.attrs.selectedItems?.[0];
  if (!item) {
    return null;
  }

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <AttachmentChip label={item.label} color="primary" />
    </NodeViewWrapper>
  );
};
