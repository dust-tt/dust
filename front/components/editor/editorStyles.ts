import { cva } from "class-variance-authority";

export const editorVariants = cva(
  [
    "overflow-auto border rounded-xl px-3 pt-2 pb-8 resize-y",
    "transition-all duration-200",
    "bg-muted-background dark:bg-muted-background-night",
  ],
  {
    variants: {
      error: {
        true: [
          "border-border-warning/30 dark:border-border-warning-night/60",
          "ring-warning/0 dark:ring-warning-night/0",
          "focus-visible:border-border-warning dark:focus-visible:border-border-warning-night",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-warning/10 dark:focus-visible:ring-warning/30",
        ],
        false: [
          "border-border dark:border-border-night",
          "focus:ring-highlight-300 dark:focus:ring-highlight-300-night",
          "focus:outline-highlight-200 dark:focus:outline-highlight-200-night",
          "focus:border-highlight-300 dark:focus:border-highlight-300-night",
        ],
      },
    },
    defaultVariants: {
      error: false,
    },
  }
);
