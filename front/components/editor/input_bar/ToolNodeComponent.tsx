import { AttachmentChip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";

interface ToolNodeComponentProps {
  node: { attrs: { toolName?: string | null } };
}

// Inline chip rendered for a <tool> node in the conversation input bar. The
// picker inserts the node with a resolved tool name. Removal is driven by the
// footer tool chip (mirroring knowledge / dataSourceLink), which removes the
// inline chip through the sync effect in InputBarContainer.
export const ToolNodeComponent = ({ node }: ToolNodeComponentProps) => {
  const { toolName } = node.attrs;
  if (!toolName) {
    return null;
  }

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <AttachmentChip label={toolName} color="primary" />
    </NodeViewWrapper>
  );
};
