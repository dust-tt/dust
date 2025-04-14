import { markdownStyles } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/react";

export const CoEditionStyleExtension = Extension.create({
  name: "coEditionStyle",

  addGlobalAttributes() {
    return [
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
      {
        types: ["heading"],
        attributes: {
          class: {
            default: null,
            parseHTML: () => {
              return null;
            },
            renderHTML: (attributes) => {
              const level = attributes.level;

              let className = "";
              if (level === 1) {
                className = "text-3xl font-bold mb-4";
              } else if (level === 2) {
                className = "text-2xl font-semibold mb-3";
              } else if (level === 3) {
                className = "text-xl font-medium mb-2";
              } else if (level === 4) {
                className = "text-lg font-medium mb-2";
              } else if (level === 5) {
                className = "text-base font-medium mb-2";
              } else if (level === 6) {
                className = "text-sm font-medium mb-2";
              }

              if (!className) {
                return {};
              }

              return {
                class: className,
              };
            },
          },
        },
      },
      {
        types: ["paragraph"],
        attributes: {
          class: {
            default: "m-2",
          },
        },
      },
    ];
  },
});
