import { Node } from "@tiptap/core";

export const FILE_SEARCH_NODE_TYPE = "fileSearchNode";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileSearchNode: {
      insertFileSearchNode: () => ReturnType;
    };
  }
}

export const FileSearchNode = Node.create({
  name: FILE_SEARCH_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  parseHTML() {
    return [];
  },

  renderHTML() {
    return ["span", { "data-file-search": "true" }];
  },

  addCommands() {
    return {
      insertFileSearchNode:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});
