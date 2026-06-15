import { cva } from "class-variance-authority";

export const editorVariants = cva(
  [
    "overflow-auto border rounded-xl px-3 pt-2 pb-8 resize-y",
    "transition-all duration-200",
"bg-muted-background",
  ],
  {
    variants: {
      error: {
        true: [
"border-border-warning/30",
"ring-warning/0",
"focus-visible:border-border-warning",
          "focus-visible:outline-hidden focus-visible:ring-2",
"focus-visible:ring-warning/10",
        ],
        false: [
"border-border",
"focus:ring-highlight-300",
"focus:outline-highlight-200",
"focus:border-highlight-300",
        ],
      },
      disabled: {
        true: [
          "opacity-60 cursor-not-allowed resize-none",
"bg-muted-background/50",
        ],
        false: [],
      },
      // Used for skill suggestions. It just changes the cursor.
      readOnly: {
        true: ["cursor-not-allowed"],
        false: [],
      },
    },
    defaultVariants: {
      error: false,
      disabled: false,
      readOnly: false,
    },
  }
);
