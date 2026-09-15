import {
  KNOWLEDGE_NODE_TYPE,
  KnowledgeNode as KnowledgeNodeBase,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { KnowledgeNodeComponent } from "@app/components/editor/input_bar/KnowledgeNodeComponent";
import type { NodeViewProps } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export { KNOWLEDGE_NODE_TYPE };

// Interactive variant of KnowledgeNode for the conversation input bar. It reuses
// the schema-only base (which owns the <knowledge> tag serialization shared with
// the skill builder) and adds a lightweight chip node view. The base lives in
// skill_builder so server-side code can register the node without pulling in React.
export const KnowledgeNode = KnowledgeNodeBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <KnowledgeNodeComponent node={{ attrs: props.node.attrs }} />
    ));
  },
});
