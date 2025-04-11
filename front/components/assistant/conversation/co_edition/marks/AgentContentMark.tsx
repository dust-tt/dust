import { Mark, mergeAttributes } from "@tiptap/react";

// Mark for agent-typed content.
export const AgentContentMark = Mark.create({
  name: "agentContent",

  addAttributes() {
    return {
      class: {
        default: "text-gray-400", // Light gray color.
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
            element.getAttribute("data-author") === "agent"
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
      mergeAttributes(HTMLAttributes, { "data-author": "agent" }),
      0,
    ];
  },
});
