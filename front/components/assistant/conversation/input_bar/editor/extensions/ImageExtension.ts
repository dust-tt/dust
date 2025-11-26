import { Node } from "@tiptap/core";

/**
 * TipTap extension for rendering dust images (file references).
 * Handles the dustimg custom element from markdown.
 */
export const ImageExtension = Node.create({
  name: "dustimg",

  group: "inline",

  inline: true,

  atom: true,

  addAttributes() {
    return {
      src: {
        default: "",
      },
      alt: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "dustimg",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dustimg", HTMLAttributes];
  },
});
