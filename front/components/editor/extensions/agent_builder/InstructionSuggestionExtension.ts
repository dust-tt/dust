import type { JSONContent } from "@tiptap/core";
import { Extension, Mark } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { diffWords } from "diff";

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

const suggestionHighlightPluginKey = new PluginKey<{
  highlightedId: string | null;
}>("suggestionHighlight");

function createSuggestionHighlightPlugin(
  getHighlightedId: () => string | null
) {
  return new Plugin({
    key: suggestionHighlightPluginKey,
    state: {
      init() {
        return { highlightedId: null };
      },
      apply(tr, value) {
        const meta = tr.getMeta(suggestionHighlightPluginKey);
        if (meta !== undefined) {
          return { highlightedId: meta };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        const nodes = collectSuggestionNodes(state);
        if (nodes.length === 0) {
          return null;
        }

        const pluginState = suggestionHighlightPluginKey.getState(state);
        const highlightedId = pluginState?.highlightedId ?? getHighlightedId();

        const decorations = nodes.map((node) =>
          Decoration.inline(node.from, node.to, {
            class: getSuggestionClass(
              node.isAdd,
              highlightedId !== null && node.suggestionId === highlightedId
            ),
          })
        );

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

export interface SuggestionMatch {
  start: number;
  end: number;
}

// Block-based suggestion options (new approach).
export interface ApplySuggestionOptions {
  id: string;
  targetBlockId: string;
  /** Full HTML content for the block, including the tag (e.g., '<p>New text</p>') */
  content: string;
}

// Legacy string-based suggestion options (kept for backward compatibility).
export interface LegacyApplySuggestionOptions {
  id: string;
  find: string;
  replacement: string;
}

// Stored data for each active suggestion.
interface SuggestionData {
  targetBlockId: string;
  oldContent: string;
  /** The text content extracted from the HTML */
  newContent: string;
}

/**
 * Extracts text content from an HTML string.
 * Strips HTML tags and returns the inner text.
 */
function extractTextFromHtml(html: string): string {
  // Match content between HTML tags, handling self-closing tags and nested content.
  const match = html.match(/^<[^>]+>(.*)$/s);
  if (!match) {
    // No tag found, return as-is (backward compatibility).
    return html;
  }

  // Find the closing tag position and extract content.
  const openTagEnd = html.indexOf(">") + 1;
  const closeTagStart = html.lastIndexOf("</");

  if (closeTagStart === -1) {
    // Self-closing or no closing tag, return content after opening tag.
    return html.slice(openTagEnd);
  }

  return html.slice(openTagEnd, closeTagStart);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionSuggestion: {
      applySuggestion: (options: ApplySuggestionOptions) => ReturnType;
      applyLegacySuggestion: (
        options: LegacyApplySuggestionOptions
      ) => ReturnType;
      acceptSuggestion: (suggestionId: string) => ReturnType;
      rejectSuggestion: (suggestionId: string) => ReturnType;
      acceptAllSuggestions: () => ReturnType;
      rejectAllSuggestions: () => ReturnType;
      setHighlightedSuggestion: (suggestionId: string | null) => ReturnType;
    };
  }

  interface Storage {
    instructionSuggestion: {
      activeSuggestions: Map<string, SuggestionData>;
      activeSuggestionIds: string[];
      highlightedSuggestionId: string | null;
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
 * Gets the committed HTML content from the editor with block IDs.
 * Uses TipTap's built-in HTML serialization (which includes data-block-id from BlockIdExtension).
 * Suggestion addition marks are filtered out to show only committed content.
 * CSS classes are stripped to return clean HTML structure.
 */
export function getCommittedHtmlWithBlockIds(editor: {
  getHTML: () => string;
}): string {
  const html = editor.getHTML();

  // Remove suggestion addition spans (uncommitted content).
  // These are rendered as: <span class="suggestion-addition ..." data-suggestion-id="...">text</span>
  const withoutAdditions = html.replace(
    /<span[^>]*class="[^"]*suggestion-addition[^"]*"[^>]*>.*?<\/span>/gs,
    ""
  );

  // Remove suggestion deletion spans but keep their content (original text).
  // These are rendered as: <span class="suggestion-deletion ..." data-suggestion-id="...">text</span>
  const withoutDeletionMarks = withoutAdditions.replace(
    /<span[^>]*class="[^"]*suggestion-deletion[^"]*"[^>]*>(.*?)<\/span>/gs,
    "$1"
  );

  // Remove all class attributes to return clean HTML structure.
  const withoutClasses = withoutDeletionMarks.replace(/\s*class="[^"]*"/g, "");

  return withoutClasses;
}

interface NodeLike {
  readonly isText?: boolean;
  readonly text?: string;
  readonly marks?: ReadonlyArray<{ readonly type: { readonly name: string } }>;
  readonly content?: {
    forEach: (fn: (child: NodeLike) => void) => void;
  };
}

function extractCommittedTextFromNode(node: NodeLike): string {
  if (node.isText) {
    const hasAdditionMark = node.marks?.some(
      (mark) => mark.type.name === "suggestionAddition"
    );
    return hasAdditionMark ? "" : (node.text ?? "");
  }

  let result = "";
  if (node.content) {
    node.content.forEach((child) => {
      result += extractCommittedTextFromNode(child);
    });
  }
  return result;
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

/**
 * Finds a block node by its block ID attribute.
 * Returns the node and its position, or null if not found.
 */
function findBlockByBlockId(
  doc: EditorState["doc"],
  targetBlockId: string
): { node: EditorState["doc"]; pos: number } | null {
  let result: { node: EditorState["doc"]; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (result) {
      return false; // Already found, stop searching.
    }

    // Check if this node has a matching blockId attribute.
    if (node.isBlock && node.attrs.blockId === targetBlockId) {
      result = { node, pos };
      return false;
    }
    return true;
  });

  return result;
}

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
      activeSuggestions: new Map<string, SuggestionData>(),
      activeSuggestionIds: [] as string[],
      highlightedSuggestionId: null as string | null,
    };
  },

  addExtensions() {
    return [SuggestionAdditionMark, SuggestionDeletionMark];
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      createSuggestionHighlightPlugin(() => storage.highlightedSuggestionId),
    ];
  },

  addCommands() {
    return {
      applySuggestion:
        (options: ApplySuggestionOptions) =>
        ({ tr, state, dispatch }) => {
          const { id, targetBlockId, content } = options;
          const { doc, schema } = state;

          // Find the block by its ID.
          const blockInfo = findBlockByBlockId(doc, targetBlockId);
          if (!blockInfo) {
            return false;
          }

          const { node: blockNode, pos: blockPos } = blockInfo;
          const oldContent = extractCommittedTextFromNode(blockNode);

          // Extract text content from HTML for diff computation.
          const newContent = extractTextFromHtml(content);

          // Compute word-level diff.
          const diffs = diffWords(oldContent, newContent);

          // Build the replacement content with marks.
          const deletionMark = schema.marks.suggestionDeletion.create({
            suggestionId: id,
          });
          const additionMark = schema.marks.suggestionAddition.create({
            suggestionId: id,
          });

          const newNodes: Array<ReturnType<typeof schema.text>> = [];
          for (const part of diffs) {
            if (part.added) {
              newNodes.push(schema.text(part.value, [additionMark]));
            } else if (part.removed) {
              newNodes.push(schema.text(part.value, [deletionMark]));
            } else {
              newNodes.push(schema.text(part.value));
            }
          }

          if (dispatch) {
            // Calculate the content range within the block (exclude the block node itself).
            const from = blockPos + 1; // Skip the opening tag.
            const to = blockPos + blockNode.nodeSize - 1; // Before the closing tag.

            // Replace the block's content.
            tr.delete(from, to);

            let insertPos = from;
            for (const node of newNodes) {
              tr.insert(insertPos, node);
              insertPos += node.nodeSize;
            }

            dispatch(tr);
          }

          // Track this suggestion.
          this.storage.activeSuggestions.set(id, {
            targetBlockId,
            oldContent,
            newContent,
          });
          this.storage.activeSuggestionIds.push(id);

          return true;
        },

      // Legacy command for backward compatibility with old suggestion format.
      applyLegacySuggestion:
        (options: LegacyApplySuggestionOptions) =>
        ({ tr, state, dispatch }) => {
          const { id, find, replacement } = options;
          const { doc, schema } = state;

          // Normalize suggestion text by stripping list markers and trailing whitespace.
          const normalizedFind = find
            .replace(/^(?:[-*]|\d+\.)\s+/, "")
            .replace(/\s+$/, "");

          // Get full document text and find the position.
          const fullText = doc.textContent;
          const textIndex = fullText.indexOf(normalizedFind);

          if (textIndex === -1) {
            return false;
          }

          // Use normalizedFind for position mapping.
          const findLength = normalizedFind.length;

          // Map text offset to document position.
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

              if (
                from === -1 &&
                textIndex >= nodeStart &&
                textIndex < nodeEnd
              ) {
                from = pos + (textIndex - nodeStart);
              }

              const findEnd = textIndex + findLength;
              if (to === -1 && findEnd > nodeStart && findEnd <= nodeEnd) {
                to = pos + (findEnd - nodeStart);
              }

              currentTextOffset = nodeEnd;
            }
            return true;
          });

          if (findLength === 0) {
            from = from === -1 ? 1 : from;
            to = from;
          }

          if (from === -1 || to === -1) {
            return false;
          }

          const normalizedReplacement = replacement
            .replace(/^(?:[-*]|\d+\.)\s+/, "")
            .replace(/\s+$/, "");

          const deletionMark = schema.marks.suggestionDeletion.create({
            suggestionId: id,
          });
          const additionMark = schema.marks.suggestionAddition.create({
            suggestionId: id,
          });

          if (dispatch) {
            tr.delete(from, to);

            let insertPos = from;

            if (normalizedFind.length > 0) {
              const deletionNode = schema.text(normalizedFind, [deletionMark]);
              tr.insert(insertPos, deletionNode);
              insertPos += deletionNode.nodeSize;
            }

            if (normalizedReplacement.length > 0) {
              const additionNode = schema.text(normalizedReplacement, [
                additionMark,
              ]);
              tr.insert(insertPos, additionNode);
            }

            dispatch(tr);
          }

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
            this.storage.activeSuggestions.delete(suggestionId);
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
            this.storage.activeSuggestions.delete(suggestionId);
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

      setHighlightedSuggestion:
        (suggestionId: string | null) =>
        ({ tr, dispatch, view }) => {
          this.storage.highlightedSuggestionId = suggestionId;

          if (dispatch) {
            tr.setMeta(suggestionHighlightPluginKey, suggestionId);
            dispatch(tr);
          }

          if (view) {
            view.updateState(view.state);
          }

          return true;
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
