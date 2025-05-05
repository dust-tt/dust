import { Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import { diffWords } from "diff";

import { AdditionMark, DeletionMark } from "./DiffMarks";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    promptDiff: {
      applyDiff: (oldContent: string, newContent: string) => ReturnType;
      exitDiff: () => ReturnType;
    };
  }
}

/**
 * Builds a complete diff view that includes both additions and deletions
 * Returns a ProseMirror-compatible JSON structure
 */
export function buildWordDiffContent(
  oldText: string,
  newText: string
): JSONContent {
  const diffs = diffWords(oldText, newText);

  const content = diffs.map((part) => {
    const node: JSONContent = {
      type: "text",
      text: part.value,
    };

    if (part.added) {
      node.marks = [{ type: AdditionMark.name }];
    } else if (part.removed) {
      node.marks = [{ type: DeletionMark.name }];
    }

    return node;
  });

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content,
      },
    ],
  };
}

export interface PromptDiffOptions {
  onDiffApplied?: () => void;
}

export const PromptDiffExtension = Extension.create<PromptDiffOptions>({
  name: "promptDiff",

  addOptions() {
    return {
      onDiffApplied: undefined,
    };
  },

  addStorage() {
    return {
      originalContent: null,
      isDiffMode: false,
    };
  },

  addExtensions() {
    return [AdditionMark, DeletionMark];
  },

  addCommands() {
    return {
      applyDiff:
        (oldContent: string, newContent: string) =>
        ({ editor, commands }) => {
          // Save the original content for restoring later
          this.storage.originalContent = editor.getJSON();
          this.storage.isDiffMode = true;

          // Create the diff content with both additions and deletions
          const diffContent = buildWordDiffContent(oldContent, newContent);

          // Replace editor content with the diff view
          const result = commands.setContent(diffContent);

          if (result) {
            editor.setEditable(false);

            if (this.options.onDiffApplied) {
              this.options.onDiffApplied();
            }
          }

          return result;
        },

      exitDiff:
        () =>
        ({ editor, commands }) => {
          if (!this.storage.isDiffMode) {
            return false;
          }

          // Restore original content
          const result = this.storage.originalContent
            ? commands.setContent(this.storage.originalContent)
            : commands.clearContent();

          if (result) {
            editor.setEditable(true);
            this.storage.isDiffMode = false;
            this.storage.originalContent = null;
          }

          return result;
        },
    };
  },
});
