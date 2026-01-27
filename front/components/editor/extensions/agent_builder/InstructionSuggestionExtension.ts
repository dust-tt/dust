import type { JSONContent } from "@tiptap/core";
import { Extension, Mark } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { diffWords } from "diff";

// Mark for additions (blue background).
export const SuggestionAdditionMark = Mark.create({
  name: "suggestionAddition",

  addAttributes() {
    return {
      suggestionId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.suggestion-addition" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        class:
          "suggestion-addition s-rounded s-bg-highlight-100 dark:s-bg-highlight-100-night s-text-highlight-800",
        "data-suggestion-id": HTMLAttributes.suggestionId,
      },
      0,
    ];
  },
});

// Mark for deletions (red background + strikethrough).
export const SuggestionDeletionMark = Mark.create({
  name: "suggestionDeletion",

  addAttributes() {
    return {
      suggestionId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.suggestion-deletion" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        class:
          "suggestion-deletion s-rounded s-bg-warning-100 dark:s-bg-warning-100-night s-text-warning-800 s-line-through",
        "data-suggestion-id": HTMLAttributes.suggestionId,
      },
      0,
    ];
  },
});

export interface SuggestionMatch {
  start: number;
  end: number;
}

export interface ApplySuggestionOptions {
  id: string;
  find: string;
  replacement: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionSuggestion: {
      applySuggestion: (options: ApplySuggestionOptions) => ReturnType;
      acceptSuggestion: (suggestionId: string) => ReturnType;
      rejectSuggestion: (suggestionId: string) => ReturnType;
      acceptAllSuggestions: () => ReturnType;
      rejectAllSuggestions: () => ReturnType;
    };
  }

  interface Storage {
    instructionSuggestion: {
      activeSuggestionIds: string[];
    };
  }
}

/**
 * Gets the committed text content from the editor, excluding suggestion marks.
 * This returns the text as it would be without any pending suggestions.
 */
export function getCommittedTextContent(editor: {
  getJSON: () => JSONContent;
}): string {
  const json = editor.getJSON();

  return extractCommittedText(json);
}

function extractCommittedText(node: JSONContent): string {
  if (node.type === "text") {
    // Addition marks are suggested additions not yet accepted, exclude them.
    // All other text (including deletion marks which are original text) is included.
    const hasAdditionMark = node.marks?.some(
      (mark) => mark.type === "suggestionAddition"
    );

    return hasAdditionMark ? "" : (node.text ?? "");
  }

  if (node.content) {
    const childText = node.content.map(extractCommittedText).join("");

    // Add appropriate spacing for block-level elements.
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "bulletList" ||
      node.type === "orderedList"
    ) {
      return childText + "\n\n";
    }
    if (node.type === "listItem") {
      return "- " + childText + "\n";
    }

    return childText;
  }

  return "";
}

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
      activeSuggestionIds: [] as string[],
    };
  },

  addExtensions() {
    return [SuggestionAdditionMark, SuggestionDeletionMark];
  },

  addCommands() {
    return {
      applySuggestion:
        (options: ApplySuggestionOptions) =>
        ({ tr, state, dispatch }) => {
          const { id, find, replacement } = options;
          const { doc, schema } = state;

          // Find the text position in the actual document.
          let from = -1;
          let to = -1;

          doc.descendants((node, pos) => {
            if (from !== -1) {
              return false; // Stop searching once found.
            }

            if (node.isText && node.text) {
              const index = node.text.indexOf(find);
              if (index !== -1) {
                from = pos + index;
                to = pos + index + find.length;
                return false;
              }
            }
            return true;
          });

          if (from === -1) {
            return false;
          }

          // Build diff parts.
          const diffParts = diffWords(find, replacement);

          // Create content nodes with marks for the diff.
          const nodes: ReturnType<typeof schema.text>[] = [];
          for (const part of diffParts) {
            if (part.added) {
              const mark = schema.marks.suggestionAddition.create({
                suggestionId: id,
              });
              nodes.push(schema.text(part.value, [mark]));
            } else if (part.removed) {
              const mark = schema.marks.suggestionDeletion.create({
                suggestionId: id,
              });
              nodes.push(schema.text(part.value, [mark]));
            } else {
              nodes.push(schema.text(part.value));
            }
          }

          // Apply the transaction: delete old text and insert new nodes.
          if (dispatch) {
            tr.delete(from, to);

            // Insert nodes at the deletion position.
            let insertPos = from;
            for (const node of nodes) {
              tr.insert(insertPos, node);
              insertPos += node.nodeSize;
            }

            dispatch(tr);
          }

          // Track this suggestion.
          this.storage.activeSuggestionIds.push(id);

          return true;
        },

      acceptSuggestion:
        (suggestionId: string) =>
        ({ state, tr }) => {
          // Accept: remove deletions (old text), keep additions (new text) without marks.
          const modified = processSuggestionMarks(state, tr, suggestionId, {
            markToDelete: "suggestionDeletion",
            markToKeep: "suggestionAddition",
          });

          if (modified) {
            this.storage.activeSuggestionIds =
              this.storage.activeSuggestionIds.filter(
                (id: string) => id !== suggestionId
              );
          }

          return modified;
        },

      rejectSuggestion:
        (suggestionId: string) =>
        ({ state, tr }) => {
          // Reject: remove additions (new text), keep deletions (old text) without marks.
          const modified = processSuggestionMarks(state, tr, suggestionId, {
            markToDelete: "suggestionAddition",
            markToKeep: "suggestionDeletion",
          });

          if (modified) {
            this.storage.activeSuggestionIds =
              this.storage.activeSuggestionIds.filter(
                (id: string) => id !== suggestionId
              );
          }

          return modified;
        },

      acceptAllSuggestions:
        () =>
        ({ commands }) => {
          const suggestionIds = [...this.storage.activeSuggestionIds];

          return suggestionIds.every((id) => commands.acceptSuggestion(id));
        },

      rejectAllSuggestions:
        () =>
        ({ commands }) => {
          const suggestionIds = [...this.storage.activeSuggestionIds];

          return suggestionIds.every((id) => commands.rejectSuggestion(id));
        },
    };
  },
});

interface SuggestionMarkConfig {
  markToDelete: "suggestionDeletion" | "suggestionAddition";
  markToKeep: "suggestionDeletion" | "suggestionAddition";
}

interface SuggestionOperation {
  type: "delete" | "removeMark";
  pos: number;
  nodeSize: number;
}

// Processes suggestion marks for accept/reject operations.
// Deletes text with markToDelete, removes markToKeep from text while keeping the text.
// Operations are collected first then applied in reverse order (from end to start)
// to avoid position shifts from deletions invalidating subsequent operations.
function processSuggestionMarks(
  state: EditorState,
  tr: Transaction,
  suggestionId: string,
  config: SuggestionMarkConfig
): boolean {
  const { doc, schema } = state;
  const operations: SuggestionOperation[] = [];

  // First pass: collect all operations with their positions.
  doc.descendants((node, pos) => {
    if (!node.isText || node.marks.length === 0) {
      return;
    }

    const matchingMark = node.marks.find(
      (mark) =>
        (mark.type.name === "suggestionDeletion" ||
          mark.type.name === "suggestionAddition") &&
        mark.attrs.suggestionId === suggestionId
    );

    if (!matchingMark) {
      return;
    }

    const markTypeName = matchingMark.type.name;
    if (markTypeName === config.markToDelete) {
      operations.push({ type: "delete", pos, nodeSize: node.nodeSize });
    } else if (markTypeName === config.markToKeep) {
      operations.push({ type: "removeMark", pos, nodeSize: node.nodeSize });
    }
  });

  if (operations.length === 0) {
    return false;
  }

  // Sort by position descending to process from end to start.
  operations.sort((a, b) => b.pos - a.pos);

  // Second pass: apply operations in reverse order.
  for (const op of operations) {
    if (op.type === "delete") {
      tr.delete(op.pos, op.pos + op.nodeSize);
    } else {
      tr.removeMark(
        op.pos,
        op.pos + op.nodeSize,
        schema.marks[config.markToKeep]
      );
    }
  }

  return true;
}

