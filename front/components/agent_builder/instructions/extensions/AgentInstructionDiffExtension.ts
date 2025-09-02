import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { diffArrays } from "diff";

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

            const diffParts = diffArrays(
              splitParagraphs(oldContent),
              splitParagraphs(newContent)
            );
            this.storage.diffParts = diffParts;

            let addedCount = 0;
            let removedCount = 0;

            diffParts.forEach((part) => {
              const paras: string[] = Array.isArray(part.value)
                ? part.value
                : [String(part.value ?? "")];
              const wordCount = paras
                .join(" ")
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

            const diffContent = buildParagraphDiffContent(diffParts);

            const hasChanges = diffParts.some((p: any) => p.added || p.removed);
            const result = commands.setContent(diffContent);

            if (!hasChanges) {
              // No marks/tokens; keep editor editable and exit diff mode immediately
              editor.setEditable(true);
              this.storage.isDiffMode = false;
              this.storage.originalContent = null;
            } else if (result) {
              // Make editor read-only during inline review
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

// Paragraph split by blank lines
function splitParagraphs(t: string): string[] {
  return t.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((s) => s.trim());
}

// Helper: build paragraph-level diff content
function buildParagraphDiffContent(diffParts: any[]): JSONContent {
  const paragraphs: JSONContent[] = [];
  diffParts.forEach((part: any) => {
    const paras: string[] = Array.isArray(part.value) ? part.value : [String(part.value ?? "")];
    paras.forEach((p) => {
      const trimmed = (p ?? "").toString();
      if (trimmed.trim().length === 0) {
        // Push an empty paragraph (no empty text nodes)
        paragraphs.push({ type: "paragraph" });
      } else {
        const textNode: JSONContent = { type: "text", text: trimmed };
        if (part.added) {
          textNode.marks = [{ type: AdditionMark.name }];
        } else if (part.removed) {
          textNode.marks = [{ type: DeletionMark.name }];
        }
        paragraphs.push({ type: "paragraph", content: [textNode] });
      }
    });
  });
  return { type: "doc", content: paragraphs };
}
