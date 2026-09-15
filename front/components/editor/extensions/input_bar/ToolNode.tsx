import {
  TOOL_NODE_TYPE,
  ToolNode as ToolNodeBase,
} from "@app/components/editor/extensions/skill_builder/ToolNode";
import { ToolNodeComponent } from "@app/components/editor/input_bar/ToolNodeComponent";
import type { NodeViewProps } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export { TOOL_NODE_TYPE };

// Interactive variant of ToolNode for the conversation input bar. It reuses the
// schema-only base (which owns the <tool> tag serialization shared with the
// skill builder) and adds a lightweight chip node view. The base lives in
// skill_builder so server-side code can register the node without pulling in React.
export const ToolNode = ToolNodeBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <ToolNodeComponent node={{ attrs: props.node.attrs }} />
    ));
  },
});
