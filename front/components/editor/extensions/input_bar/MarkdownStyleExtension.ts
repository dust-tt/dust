import { markdownStyles } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/react";

export const MarkdownStyleExtension = Extension.create({
  name: "markdownStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["code"],
        attributes: {
          class: {
            default: markdownStyles.code(),
          },
        },
      },
      {
        types: ["textContent"],
        attributes: {
          class: {
            default: markdownStyles.paragraph(),
          },
        },
      },
      {
        types: ["listItem"],
        attributes: {
          class: {
            default: markdownStyles.list(),
          },
        },
      },
      {
        types: ["bulletList"],
        attributes: {
          class: {
            default: markdownStyles.unorderedList(),
          },
        },
      },
      {
        types: ["pre"],
        attributes: {
          class: {
            default: markdownStyles.pre(),
          },
        },
      },
      {
        types: ["orderedList"],
        attributes: {
          class: {
            default: markdownStyles.orderedList(),
          },
        },
      },
      {
        types: ["codeBlock"],
        attributes: {
          class: {
            default: markdownStyles.code(),
          },
        },
      },
      {
        types: ["blockquote"],
        attributes: {
          class: {
            default: markdownStyles.blockquote(),
          },
        },
      },
    ];
  },
});
