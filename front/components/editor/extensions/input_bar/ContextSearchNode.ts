import { Node } from "@tiptap/core";

export const CONTEXT_SEARCH_NODE_TYPE = "contextSearchNode";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    contextSearchNode: {
      insertContextSearchNode: () => ReturnType;
    };
  }
}

export const ContextSearchNode = Node.create({
  name: CONTEXT_SEARCH_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  parseHTML() {
    return [];
  },

  renderHTML() {
    return ["span", { "data-context-search": "true" }];
  },

  addCommands() {
    return {
      insertContextSearchNode:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});
