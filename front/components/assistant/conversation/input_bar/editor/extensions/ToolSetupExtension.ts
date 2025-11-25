import { Node } from "@tiptap/core";

/**
 * TipTap extension for rendering tool setup cards.
 * Handles the :toolSetup[name]{sId=xxx} directive from markdown.
 */
export const ToolSetupExtension = Node.create({
  name: "toolSetup",

  group: "inline",

  inline: true,

  atom: true,

  addAttributes() {
    return {
      toolId: {
        default: "",
      },
      toolName: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "toolSetup",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["toolSetup", HTMLAttributes];
  },
});
