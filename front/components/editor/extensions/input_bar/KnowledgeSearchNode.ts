import { Node } from "@tiptap/core";

export const KNOWLEDGE_SEARCH_NODE_TYPE = "knowledgeSearchNode";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    knowledgeSearchNode: {
      insertKnowledgeSearchNode: () => ReturnType;
    };
  }
}

export const KnowledgeSearchNode = Node.create({
  name: KNOWLEDGE_SEARCH_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  parseHTML() {
    return [];
  },

  renderHTML() {
    return ["span", { "data-knowledge-search": "true" }];
  },

  addCommands() {
    return {
      insertKnowledgeSearchNode:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});
