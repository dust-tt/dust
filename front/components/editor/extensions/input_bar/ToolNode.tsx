import { ToolChip } from "@app/components/editor/extensions/skill_builder/ToolChip";
import { ToolNode as ToolNodeBase } from "@app/components/editor/extensions/skill_builder/ToolNode";
import { serializeToolTag } from "@app/lib/tools/format";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

interface ToolNodeOptions {
  onToolDetails?: (mcpServerViewId: string) => void;
}

export const ToolNode = ToolNodeBase.extend<ToolNodeOptions>({
  addOptions() {
    return { ...this.parent?.(), onToolDetails: undefined };
  },

  renderText({ node }) {
    return serializeToolTag({
      id: node.attrs.mcpServerViewId,
      name: node.attrs.toolName,
      icon: node.attrs.toolIcon,
    });
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <NodeViewWrapper className="inline-flex align-middle">
        <ToolChip
          title={props.node.attrs.toolName}
          toolIcon={props.node.attrs.toolIcon}
          onClick={
            this.options.onToolDetails
              ? () =>
                  this.options.onToolDetails?.(props.node.attrs.mcpServerViewId)
              : undefined
          }
          onRemove={props.editor.isEditable ? props.deleteNode : undefined}
        />
      </NodeViewWrapper>
    ));
  },
});
