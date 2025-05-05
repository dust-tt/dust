import { Mark } from "@tiptap/core";

export const AdditionMark = Mark.create({
  name: "addition",

  addAttributes() {
    return {
      timestamp: {
        default: () => Date.now(),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.addition" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        class: `addition text-green-700 bg-green-200`,
      },
      0,
    ];
  },
});

export const DeletionMark = Mark.create({
  name: "deletion",

  addAttributes() {
    return {
      timestamp: {
        default: () => Date.now(),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.deletion" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        class: `deletion text-warning-600 bg-warning-100`,
        style: "text-decoration: line-through",
      },
      0,
    ];
  },
});
