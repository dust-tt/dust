import { Extension } from "@tiptap/core";

import { AdditionMark, DeletionMark } from "./DiffMarks";

type DiffType = "insert" | "delete" | "equal";

type DiffSpan = {
  type: DiffType;
  value: string;
};

function characterDiff(oldText: string, newText: string): DiffSpan[] {
  // Start with detecting common prefix
  let commonPrefixLength = 0;
  const minLength = Math.min(oldText.length, newText.length);

  while (
    commonPrefixLength < minLength &&
    oldText[commonPrefixLength] === newText[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }

  // If we have a common prefix, add it as equal
  const result: DiffSpan[] = [];

  if (commonPrefixLength > 0) {
    result.push({
      type: "equal",
      value: oldText.substring(0, commonPrefixLength),
    });
  }
  // Add the remaining parts as deletions/insertions
  if (commonPrefixLength < oldText.length) {
    result.push({
      type: "delete",
      value: oldText.substring(commonPrefixLength),
    });
  }

  if (commonPrefixLength < newText.length) {
    result.push({
      type: "insert",
      value: newText.substring(commonPrefixLength),
    });
  }

  return result;
}

export interface PromptDiffOptions {
  onDiffApplied?: () => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    promptDiff: {
      applyDiff: (oldContent: string, newContent: string) => ReturnType;
    };
  }
}

export const PromptDiffExtension = Extension.create<PromptDiffOptions>({
  name: "promptDiff",

  addOptions() {
    return {
      onDiffApplied: undefined,
    };
  },

  addExtensions() {
    return [AdditionMark, DeletionMark];
  },

  addCommands() {
    return {
      applyDiff:
        (oldContent: string, newContent: string) =>
        ({ chain }) => {
          const diffs = characterDiff(oldContent, newContent);

          // Create the content structure
          const content = {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: diffs.map((diff) => ({
                  type: "text",
                  text: diff.value,
                  marks:
                    diff.type === "insert"
                      ? [{ type: "addition" }]
                      : diff.type === "delete"
                        ? [{ type: "deletion" }]
                        : [],
                })),
              },
            ],
          };

          // Use chain to create a single transaction
          return chain().clearContent().setContent(content).run();
        },
    };
  },
});
