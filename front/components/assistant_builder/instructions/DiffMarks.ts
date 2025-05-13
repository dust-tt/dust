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

  renderHTML() {
    return [
      "span",
      {
        class: "addition text-success-700 bg-success-100",
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

  renderHTML() {
    return [
      "span",
      {
        class: "deletion text-warning-600 bg-warning-100 line-through",
      },
      0,
    ];
  },
});
