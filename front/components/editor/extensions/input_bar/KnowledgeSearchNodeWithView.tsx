import {
  KNOWLEDGE_SEARCH_NODE_TYPE,
  KnowledgeSearchNode,
} from "@app/components/editor/extensions/input_bar/KnowledgeSearchNode";
import {
  type KnowledgeSearchNodeOptions,
  KnowledgeSearchNodeView,
} from "@app/components/editor/extensions/input_bar/KnowledgeSearchNodeView";
import type { NodeViewProps } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";

export { KNOWLEDGE_SEARCH_NODE_TYPE };

const DEFAULT_KNOWLEDGE_SEARCH_NODE_OPTIONS: KnowledgeSearchNodeOptions = {
  attachedNodesRef: { current: [] },
  onNodeSelectRef: { current: undefined },
  owner: undefined,
  spaceIdRef: { current: null },
};

export const InputBarKnowledgeSearchNode =
  KnowledgeSearchNode.extend<KnowledgeSearchNodeOptions>({
    addOptions() {
      return DEFAULT_KNOWLEDGE_SEARCH_NODE_OPTIONS;
    },

    addNodeView() {
      return ReactNodeViewRenderer((props: NodeViewProps) => (
        <KnowledgeSearchNodeView {...props} options={this.options} />
      ));
    },
  });
