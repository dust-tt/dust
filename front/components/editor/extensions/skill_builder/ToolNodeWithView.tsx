import {
  ToolChip,
  ToolErrorChip,
} from "@app/components/editor/extensions/skill_builder/ToolChip";
import { ToolNode } from "@app/components/editor/extensions/skill_builder/ToolNode";
import type { ToolNodeAttributes } from "@app/components/editor/extensions/skill_builder/ToolNodeTypes";
import { useMaybeMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type React from "react";
import { useCallback, useMemo } from "react";

function useToolNodeDisplay(attrs: ToolNodeAttributes) {
  const ctx = useMaybeMCPServerViewsContext();

  return useMemo(() => {
    if (!ctx || ctx.isMCPServerViewsLoading) {
      return {
        kind: "tool" as const,
        title: attrs.toolName,
        toolIcon: attrs.toolIcon,
      };
    }

    const view = ctx.mcpServerViews.find(
      (v) => v.sId === attrs.mcpServerViewId
    );

    if (!view || ctx.isMCPServerViewsError) {
      return {
        kind: "error" as const,
        title: attrs.toolName,
      };
    }

    return {
      kind: "tool" as const,
      title: getMcpServerViewDisplayName(view),
      toolIcon: view.server.icon,
    };
  }, [attrs.mcpServerViewId, attrs.toolIcon, attrs.toolName, ctx]);
}

const ToolNodeView: React.FC<NodeViewProps> = ({
  deleteNode,
  editor,
  node,
}) => {
  const attrs: ToolNodeAttributes = {
    mcpServerViewId: node.attrs.mcpServerViewId,
    toolIcon: node.attrs.toolIcon,
    toolName: node.attrs.toolName,
  };
  const display = useToolNodeDisplay(attrs);

  const handleRemove = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      deleteNode();
    },
    [deleteNode]
  );

  const onRemove = editor.isEditable ? handleRemove : undefined;

  return (
    <NodeViewWrapper className="inline">
      {display.kind === "error" ? (
        <ToolErrorChip title={display.title} onRemove={onRemove} />
      ) : (
        <ToolChip
          title={display.title}
          toolIcon={display.toolIcon}
          onRemove={onRemove}
        />
      )}
    </NodeViewWrapper>
  );
};

export const ToolNodeWithView = ToolNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ToolNodeView);
  },
});
