import { Mark, mergeAttributes } from "@tiptap/react";

// Mark for user-typed content.
export const UserContentMark = Mark.create({
  name: "userContent",

  addAttributes() {
    return {
      class: {
        default: "text-gray-600", // Gray color.
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        getAttrs: (element) => {
          if (
            element.hasAttribute("data-author") &&
            element.getAttribute("data-author") === "user"
          ) {
            return {};
          }

          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-author": "user" }),
      0,
    ];
  },
});
