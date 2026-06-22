import { Node } from "@tiptap/core";

export const CAPABILITY_SEARCH_NODE_TYPE = "capabilitySearchNode";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    capabilitySearchNode: {
      insertCapabilitySearchNode: () => ReturnType;
    };
  }
}

export const CapabilitySearchNode = Node.create({
  name: CAPABILITY_SEARCH_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  parseHTML() {
    return [];
  },

  renderHTML() {
    return ["span", { "data-capability-search": "true" }];
  },

  addCommands() {
    return {
      insertCapabilitySearchNode:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});
