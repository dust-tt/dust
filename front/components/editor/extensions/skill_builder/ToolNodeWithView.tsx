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
import { useMemo } from "react";

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

    const labeledView =
      ctx.mcpServerViewsWithoutKnowledge.find(
        (v) => v.sId === attrs.mcpServerViewId
      ) ??
      ctx.mcpServerViewsWithKnowledge.find(
        (v) => v.sId === attrs.mcpServerViewId
      );
    const view =
      labeledView ??
      ctx.mcpServerViews.find((v) => v.sId === attrs.mcpServerViewId);

    if (!view || ctx.isMCPServerViewsError) {
      return {
        kind: "error" as const,
        title: attrs.toolName,
      };
    }

    return {
      kind: "tool" as const,
      title: labeledView?.label ?? getMcpServerViewDisplayName(view),
      toolIcon: view.server.icon,
    };
  }, [attrs.mcpServerViewId, attrs.toolIcon, attrs.toolName, ctx]);
}

function ToolNodeView({ node }: NodeViewProps) {
  const attrs: ToolNodeAttributes = {
    mcpServerViewId: node.attrs.mcpServerViewId,
    toolIcon: node.attrs.toolIcon,
    toolName: node.attrs.toolName,
  };
  const display = useToolNodeDisplay(attrs);

  return (
    <NodeViewWrapper as="span" className="inline">
      {display.kind === "error" ? (
        <ToolErrorChip title={display.title} />
      ) : (
        <ToolChip title={display.title} toolIcon={display.toolIcon} />
      )}
    </NodeViewWrapper>
  );
}

export const ToolNodeWithView = ToolNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ToolNodeView);
  },
});
