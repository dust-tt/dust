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
        class: "addition rounded bg-highlight-200 text-highlight-900",
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
        class: "deletion rounded bg-warning-200 text-warning-900 line-through",
      },
      0,
    ];
  },
});
