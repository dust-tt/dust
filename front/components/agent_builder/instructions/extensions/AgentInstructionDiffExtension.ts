import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { diffWords } from "diff";

import { AdditionMark, DeletionMark } from "./AgentDiffMarks";

export interface AgentInstructionDiffOptions {
  onDiffApplied?: () => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    agentInstructionDiff: {
      applyDiff: (oldContent: string, newContent: string) => ReturnType;
      exitDiff: () => ReturnType;
    };
  }
}

export const AgentInstructionDiffExtension =
  Extension.create<AgentInstructionDiffOptions>({
    name: "agentInstructionDiff",

    addOptions() {
      return {
        onDiffApplied: undefined,
      };
    },

    addStorage() {
      return {
        originalContent: null,
        isDiffMode: false,
        diffStats: {
          addedWordCount: 0,
          removedWordCount: 0,
        },
        diffParts: [],
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
            if (!this.storage.isDiffMode) {
              this.storage.originalContent = editor.getJSON();
            }
            this.storage.isDiffMode = true;

            const diffParts = diffWords(oldContent, newContent);
            this.storage.diffParts = diffParts;

            let addedCount = 0;
            let removedCount = 0;

            diffParts.forEach((part) => {
              const wordCount = part.value
                .trim()
                .split(/\s+/)
                .filter(Boolean).length;
              if (part.added) {
                addedCount += wordCount;
              }
              if (part.removed) {
                removedCount += wordCount;
              }
            });

            this.storage.diffStats.addedWordCount = addedCount;
            this.storage.diffStats.removedWordCount = removedCount;

            const diffContent = buildWordDiffContent(diffParts);

            const result = commands.setContent(diffContent);

            // Make editor read-only
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

            // Restore original content from saved JSON
            let result = false;
            if (this.storage.originalContent) {
              result = commands.setContent(this.storage.originalContent);
            }

            if (result) {
              editor.setEditable(true);
              this.storage.isDiffMode = false;
              this.storage.originalContent = null;
              this.storage.diffStats.addedWordCount = 0;
              this.storage.diffStats.removedWordCount = 0;
              this.storage.diffParts = [];
            }

            return result;
          },
      };
    },
  });

// Helper function to build diff content
function buildWordDiffContent(diffParts: any[]): JSONContent {
  const content = diffParts.map((part) => {
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
