import {
  ToolChip,
  ToolErrorChip,
} from "@app/components/editor/extensions/skill_builder/ToolChip";
import { ToolNode } from "@app/components/editor/extensions/skill_builder/ToolNode";
import type { ToolNodeAttributes } from "@app/components/editor/extensions/skill_builder/ToolNodeTypes";
import { useMaybeMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useMemo } from "react";

interface ToolNodeWithViewOptions {
  onToolDetails?: (tool: MCPServerViewType) => void;
}

interface ToolNodeViewProps extends NodeViewProps {
  onToolDetails?: (tool: MCPServerViewType) => void;
}

function useToolNodeDisplay(attrs: ToolNodeAttributes) {
  const ctx = useMaybeMCPServerViewsContext();

  return useMemo(() => {
    if (!ctx || ctx.isMCPServerViewsLoading) {
      return {
        kind: "tool" as const,
        title: attrs.toolName,
        toolIcon: attrs.toolIcon,
        view: null,
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
      view,
    };
  }, [attrs.mcpServerViewId, attrs.toolIcon, attrs.toolName, ctx]);
}

function ToolNodeView({ node, onToolDetails }: ToolNodeViewProps) {
  const attrs: ToolNodeAttributes = {
    mcpServerViewId: node.attrs.mcpServerViewId,
    toolIcon: node.attrs.toolIcon,
    toolName: node.attrs.toolName,
  };
  const display = useToolNodeDisplay(attrs);
  const handleClick =
    display.kind === "tool" && display.view && onToolDetails
      ? () => onToolDetails(display.view)
      : undefined;

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      {display.kind === "error" ? (
        <ToolErrorChip title={display.title} />
      ) : (
        <ToolChip
          title={display.title}
          toolIcon={display.toolIcon}
          onClick={handleClick}
        />
      )}
    </NodeViewWrapper>
  );
}

export const ToolNodeWithView = ToolNode.extend<ToolNodeWithViewOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      onToolDetails: undefined,
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <ToolNodeView {...props} onToolDetails={this.options.onToolDetails} />
    ));
  },
});
