import { markdownStyles } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/react";

export const MarkdownStyleExtension = Extension.create({
  name: "markdownStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["textContent"],
        attributes: {
          class: {
            default: markdownStyles.paragraph({ variant: "muted" }),
          },
        },
      },
      {
        types: ["listItem"],
        attributes: {
          class: {
            default: markdownStyles.list({ variant: "muted" }),
          },
        },
      },
      {
        types: ["bulletList"],
        attributes: {
          class: {
            default: markdownStyles.unorderedList({ variant: "muted" }),
          },
        },
      },
      {
        types: ["pre"],
        attributes: {
          class: {
            default: markdownStyles.pre({ variant: "muted" }),
          },
        },
      },
      {
        types: ["orderedList"],
        attributes: {
          class: {
            default: markdownStyles.orderedList({ variant: "muted" }),
          },
        },
      },
      {
        types: ["codeBlock"],
        attributes: {
          class: {
            default: markdownStyles.code({ variant: "muted" }),
          },
        },
      },
      {
        types: ["blockquote"],
        attributes: {
          class: {
            default: markdownStyles.blockquote({ variant: "muted" }),
          },
        },
      },
    ];
  },
});
