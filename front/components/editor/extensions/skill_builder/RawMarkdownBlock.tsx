import {
  RawMarkdownBlock as RawMarkdownBlockNode,
  rawContentFromNodeAttrs,
} from "@app/components/editor/extensions/skill_builder/RawMarkdownBlockNode";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

export { rawMarkdownBlockParsers } from "@app/components/editor/extensions/skill_builder/RawMarkdownBlockNode";

// The node itself is defined without a node view so the server-side markdown
// pipeline can load it without pulling React in.
export const RawMarkdownBlock = RawMarkdownBlockNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(RawMarkdownBlockView);
  },
});

interface RawMarkdownBlockViewProps extends NodeViewProps {}

function RawMarkdownBlockView({ node }: RawMarkdownBlockViewProps) {
  return (
    <NodeViewWrapper as="div" contentEditable={false}>
      <div className="whitespace-pre-wrap">
        {rawContentFromNodeAttrs(node.attrs)}
      </div>
    </NodeViewWrapper>
  );
}
