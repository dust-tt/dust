import {
  CONTEXT_SEARCH_NODE_TYPE,
  ContextSearchNode,
} from "@app/components/editor/extensions/input_bar/ContextSearchNode";
import {
  type ContextSearchNodeOptions,
  ContextSearchNodeView,
} from "@app/components/editor/extensions/input_bar/ContextSearchNodeView";
import type { NodeViewProps } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";

export { CONTEXT_SEARCH_NODE_TYPE };

const DEFAULT_CONTEXT_SEARCH_NODE_OPTIONS: ContextSearchNodeOptions = {
  attachedNodesRef: { current: [] },
  conversationIdRef: { current: null },
  includeFilesRef: { current: false },
  onNodeSelectRef: { current: undefined },
  owner: undefined,
  spaceIdRef: { current: null },
};

export const InputBarContextSearchNode =
  ContextSearchNode.extend<ContextSearchNodeOptions>({
    addOptions() {
      return DEFAULT_CONTEXT_SEARCH_NODE_OPTIONS;
    },

    addNodeView() {
      return ReactNodeViewRenderer((props: NodeViewProps) => (
        <ContextSearchNodeView {...props} options={this.options} />
      ));
    },
  });
