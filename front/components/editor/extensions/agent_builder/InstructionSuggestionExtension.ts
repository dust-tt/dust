import type { JSONContent } from "@tiptap/core";
import { Extension, Mark } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Normalize suggestion text by stripping list markers and trailing whitespace.
// List markers (- , * , 1. , etc.) are structural in TipTap, not part of text content.
function normalizeSuggestionText(text: string): string {
  return text.replace(/^(?:[-*]|\d+\.)\s+/, "").replace(/\s+$/, "");
}

// Mark for additions (styling applied via decorations based on selection state).
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
        class: "suggestion-addition rounded px-0.5",
        "data-suggestion-id": HTMLAttributes.suggestionId,
      },
      0,
    ];
  },
});

// Mark for deletions (styling applied via decorations based on selection state).
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
        class: "suggestion-deletion rounded px-0.5 line-through",
        "data-suggestion-id": HTMLAttributes.suggestionId,
      },
      0,
    ];
  },
});

interface SuggestionNode {
  from: number;
  to: number;
  isAdd: boolean;
  suggestionId: string | null;
}

// Collect all suggestion-marked nodes in the document.
function collectSuggestionNodes(state: EditorState): SuggestionNode[] {
  const nodes: SuggestionNode[] = [];

  state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }
    const addMark = node.marks.find(
      (m) => m.type.name === "suggestionAddition"
    );
    const deletionMark = node.marks.find(
      (m) => m.type.name === "suggestionDeletion"
    );
    const mark = addMark ?? deletionMark;
    if (mark) {
      nodes.push({
        from: pos,
        to: pos + node.nodeSize,
        isAdd: !!addMark,
        suggestionId: (mark.attrs.suggestionId as string) || null,
      });
    }
  });

  return nodes;
}

// Find the suggestionId of the suggestion block containing the cursor.
function getSelectedSuggestionId(
  nodes: SuggestionNode[],
  cursorPos: number
): string | null {
  const cursorNode = nodes.find(
    (n) => cursorPos >= n.from && cursorPos <= n.to
  );
  return cursorNode?.suggestionId ?? null;
}

// CSS classes for suggestion states: [isAdd][isSelected].
const SUGGESTION_CLASSES = {
  addSelected:
    "rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200",
  addUnselected:
    "rounded bg-blue-50 dark:bg-blue-900/20 text-gray-500 dark:text-gray-400",
  deleteSelected:
    "rounded bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 line-through",
  deleteUnselected:
    "rounded bg-red-50 dark:bg-red-900/20 text-gray-500 dark:text-gray-400 line-through",
};

function getSuggestionClass(isAdd: boolean, isSelected: boolean): string {
  if (isAdd) {
    return isSelected
      ? SUGGESTION_CLASSES.addSelected
      : SUGGESTION_CLASSES.addUnselected;
  }
  return isSelected
    ? SUGGESTION_CLASSES.deleteSelected
    : SUGGESTION_CLASSES.deleteUnselected;
}

// ProseMirror plugin that applies decorations based on cursor position.
const suggestionHighlightPlugin = new Plugin({
  key: new PluginKey("suggestionHighlight"),
  props: {
    decorations(state) {
      const nodes = collectSuggestionNodes(state);
      if (nodes.length === 0) {
        return null;
      }

      const selectedId = getSelectedSuggestionId(nodes, state.selection.from);
      const decorations = nodes.map((node) =>
        Decoration.inline(node.from, node.to, {
          class: getSuggestionClass(
            node.isAdd,
            selectedId !== null && node.suggestionId === selectedId
          ),
        })
      );

      return DecorationSet.create(state.doc, decorations);
    },
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

/**
 * Gets the document position of a suggestion mark by its ID.
 * Returns the start position of the first mark with the given suggestionId, or null if not found.
 */
export function getSuggestionPosition(
  editor: { state: EditorState },
  suggestionId: string
): number | null {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null) {
      return false;
    }
    const mark = node.marks.find(
      (m) =>
        (m.type.name === "suggestionAddition" ||
          m.type.name === "suggestionDeletion") &&
        m.attrs.suggestionId === suggestionId
    );
    if (mark) {
      position = pos;
    }
  });
  return position;
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

  addProseMirrorPlugins() {
    return [suggestionHighlightPlugin];
  },

  addCommands() {
    return {
      applySuggestion:
        (options: ApplySuggestionOptions) =>
        ({ tr, state, dispatch }) => {
          const { id, find, replacement } = options;
          const { doc, schema } = state;

          const normalizedFind = normalizeSuggestionText(find);

          // Get full document text and find the position.
          const fullText = doc.textContent;
          const textIndex = fullText.indexOf(normalizedFind);

          if (textIndex === -1) {
            return false;
          }

          // Use normalizedFind for position mapping.
          const findLength = normalizedFind.length;

          // Map text offset to document position.
          // We need to account for non-text content (block boundaries, etc.)
          let from = -1;
          let to = -1;
          let currentTextOffset = 0;

          doc.descendants((node, pos) => {
            if (from !== -1 && to !== -1) {
              return false;
            }

            if (node.isText && node.text) {
              const nodeStart = currentTextOffset;
              const nodeEnd = currentTextOffset + node.text.length;

              // Check if find starts in this node.
              if (
                from === -1 &&
                textIndex >= nodeStart &&
                textIndex < nodeEnd
              ) {
                from = pos + (textIndex - nodeStart);
              }

              // Check if find ends in this node.
              const findEnd = textIndex + findLength;
              if (to === -1 && findEnd > nodeStart && findEnd <= nodeEnd) {
                to = pos + (findEnd - nodeStart);
              }

              currentTextOffset = nodeEnd;
            }
            return true;
          });

          if (findLength === 0) {
            // If no text nodes exist, insert at position 1 (after opening paragraph).
            from = from === -1 ? 1 : from;
            to = from;
          }

          if (from === -1 || to === -1) {
            return false;
          }

          const normalizedReplacement = normalizeSuggestionText(replacement);

          // Simple approach: show old text (red/strikethrough) then new text (blue).
          // No word-level diffing, users accept/reject the whole suggestion.
          const deletionMark = schema.marks.suggestionDeletion.create({
            suggestionId: id,
          });
          const additionMark = schema.marks.suggestionAddition.create({
            suggestionId: id,
          });

          // Apply the transaction: replace old text with [old marked as deletion] + [new marked as addition].
          if (dispatch) {
            tr.delete(from, to);

            let insertPos = from;

            // Insert old text with deletion mark (if not empty).
            if (normalizedFind.length > 0) {
              const deletionNode = schema.text(normalizedFind, [deletionMark]);
              tr.insert(insertPos, deletionNode);
              insertPos += deletionNode.nodeSize;
            }

            // Insert new text with addition mark (if not empty).
            if (normalizedReplacement.length > 0) {
              const additionNode = schema.text(normalizedReplacement, [
                additionMark,
              ]);
              tr.insert(insertPos, additionNode);
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
