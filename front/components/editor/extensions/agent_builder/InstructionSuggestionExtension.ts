import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { DOMParser as PMDOMParser, DOMSerializer } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Transform } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ChangeSet } from "prosemirror-changeset";

// ============================================================================
// Types
// ============================================================================

/** A single block operation within a suggestion. */
interface BlockOperation {
  targetBlockId: string;
  newContent: string; // HTML content.
}

/** A stored suggestion with its operations. */
interface StoredSuggestion {
  id: string;
  operations: BlockOperation[];
}

interface PluginState {
  suggestions: Map<string, StoredSuggestion>;
  highlightedId: string | null;
}

/** Change range from diffing old vs new content. */
interface BlockChange {
  fromA: number; // Range in old content.
  toA: number;
  fromB: number; // Range in new content.
  toB: number;
}

// ============================================================================
// Plugin Key
// ============================================================================

const pluginKey = new PluginKey<PluginState>("suggestionPlugin");

// ============================================================================
// CSS Classes
// ============================================================================

const CLASSES = {
  remove: "suggestion-deletion rounded px-0.5 line-through bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200",
  removeDimmed: "suggestion-deletion rounded px-0.5 line-through bg-red-50 dark:bg-red-900/20 text-gray-400",
  add: "suggestion-addition rounded px-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200",
  addDimmed: "suggestion-addition rounded px-0.5 bg-blue-50 dark:bg-blue-900/20 text-gray-400",
};

// ============================================================================
// Diffing
// ============================================================================

/**
 * Diffs old block content vs new block content using prosemirror-changeset.
 */
function diffBlockContent(
  oldNode: PMNode,
  newNode: PMNode,
  schema: Schema
): BlockChange[] {
  // Create minimal docs wrapping the block content.
  const oldDoc = schema.node("doc", null, [
    schema.node(oldNode.type.name, oldNode.attrs, oldNode.content),
  ]);
  const newDoc = schema.node("doc", null, [
    schema.node(newNode.type.name, newNode.attrs, newNode.content),
  ]);

  // Build a Transform from old → new.
  const tr = new Transform(oldDoc);
  tr.replaceWith(1, oldNode.content.size + 1, newNode.content);

  // Feed steps to ChangeSet.
  const changeSet = ChangeSet.create(oldDoc).addSteps(newDoc, tr.mapping.maps, null);

  // Map positions back to content-relative (subtract 1 for block node start).
  return changeSet.changes.map((change) => ({
    fromA: change.fromA - 1,
    toA: change.toA - 1,
    fromB: change.fromB - 1,
    toB: change.toB - 1,
  }));
}

/**
 * Parses HTML to a ProseMirror block node.
 */
function parseHTMLToBlock(
  html: string,
  schema: Schema,
  referenceNode: PMNode
): PMNode | null {
  const domParser = PMDOMParser.fromSchema(schema);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const parsed = domParser.parse(tempDiv);

  // Find the first block node matching the reference type.
  let result: PMNode | null = null;
  parsed.content.forEach((child: PMNode) => {
    if (!result && child.type === referenceNode.type) {
      result = child;
    }
  });

  // Fallback: just take the first child.
  if (!result) {
    parsed.content.forEach((child: PMNode) => {
      result ??= child;
    });
  }

  return result;
}

// ============================================================================
// Decoration Building
// ============================================================================

/**
 * Finds a block by its blockId attribute.
 */
function findBlockByBlockId(
  doc: PMNode,
  targetBlockId: string
): { node: PMNode; pos: number } | null {
  let result: { node: PMNode; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (result) {
      return false;
    }
    if (node.attrs.blockId === targetBlockId) {
      result = { node, pos };
      return false;
    }
    return true;
  });

  return result;
}

/**
 * Builds decorations by freshly looking up blocks and diffing.
 * No cached positions - avoids staleness issues.
 */
function buildDecorations(
  state: EditorState,
  suggestions: Map<string, StoredSuggestion>,
  highlightedId: string | null
): DecorationSet {
  if (suggestions.size === 0) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];
  const schema = state.schema;

  for (const [suggestionId, suggestion] of suggestions) {
    const isHighlighted = suggestionId === highlightedId;

    for (const op of suggestion.operations) {
      // 1. Find the target block by ID.
      const found = findBlockByBlockId(state.doc, op.targetBlockId);
      if (!found) {
        continue;
      }

      const { node: blockNode, pos: blockPos } = found;

      // 2. Parse new content into a ProseMirror node.
      const newNode = parseHTMLToBlock(op.newContent, schema, blockNode);
      if (!newNode) {
        continue;
      }

      // 3. Diff old vs new.
      const changes = diffBlockContent(blockNode, newNode, schema);

      // 4. Create decorations from the diff.
      const contentStart = blockPos + 1;

      for (const change of changes) {
        // Deleted range (exists in old doc).
        if (change.fromA !== change.toA) {
          decorations.push(
            Decoration.inline(
              contentStart + change.fromA,
              contentStart + change.toA,
              {
                class: isHighlighted ? CLASSES.remove : CLASSES.removeDimmed,
                "data-suggestion-id": suggestionId,
              }
            )
          );
        }

        // Inserted content (exists in new doc, not in old).
        if (change.fromB !== change.toB) {
          const insertedSlice = newNode.content.cut(change.fromB, change.toB);

          decorations.push(
            Decoration.widget(
              contentStart + change.fromA,
              () => {
                const span = document.createElement("span");
                span.className = isHighlighted ? CLASSES.add : CLASSES.addDimmed;
                span.setAttribute("data-suggestion-id", suggestionId);
                span.contentEditable = "false";

                // Render the ProseMirror fragment as HTML (preserves bold, italic, etc.).
                const serializer = DOMSerializer.fromSchema(schema);
                serializer.serializeFragment(insertedSlice, {}, span);

                return span;
              },
              { side: -1 }
            )
          );
        }
      }
    }
  }

  return DecorationSet.create(state.doc, decorations);
}

// ============================================================================
// Plugin
// ============================================================================

function createPlugin(getHighlightedId: () => string | null) {
  return new Plugin<PluginState>({
    key: pluginKey,

    state: {
      init(): PluginState {
        return { suggestions: new Map(), highlightedId: null };
      },

      apply(tr, state): PluginState {
        const meta = tr.getMeta(pluginKey);

        if (meta?.type === "add") {
          const newSuggestions = new Map(state.suggestions);
          newSuggestions.set(meta.suggestion.id, meta.suggestion);
          return { ...state, suggestions: newSuggestions };
        }

        if (meta?.type === "remove") {
          const newSuggestions = new Map(state.suggestions);
          newSuggestions.delete(meta.id);
          return { ...state, suggestions: newSuggestions };
        }

        if (meta?.type === "highlight") {
          return { ...state, highlightedId: meta.id };
        }

        return state;
      },
    },

    props: {
      decorations(editorState) {
        const state = pluginKey.getState(editorState);
        if (!state) {
          return null;
        }
        const highlightedId = state.highlightedId ?? getHighlightedId();
        return buildDecorations(editorState, state.suggestions, highlightedId);
      },
    },
  });
}

// ============================================================================
// Public Types
// ============================================================================

export interface ApplySuggestionOptions {
  id: string;
  targetBlockId: string;
  /** HTML content for the block (e.g., '<p>New text with <strong>bold</strong></p>'). */
  content: string;
}

export interface LegacyApplySuggestionOptions {
  id: string;
  find: string;
  replacement: string;
}

export interface SuggestionMatch {
  start: number;
  end: number;
}

interface SuggestionData {
  targetBlockId: string;
  oldContent: string;
  newContent: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionSuggestion: {
      applySuggestion: (options: ApplySuggestionOptions) => ReturnType;
      applyLegacySuggestion: (options: LegacyApplySuggestionOptions) => ReturnType;
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

// ============================================================================
// Exported Utilities
// ============================================================================

/**
 * Gets the committed text content from the editor.
 * With pure decoration approach, the document IS the committed content.
 */
export function getCommittedTextContent(editor: {
  getJSON: () => JSONContent;
}): string {
  return extractText(editor.getJSON());
}

function extractText(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.content) {
    const childText = node.content.map(extractText).join("");

    if (["paragraph", "heading", "bulletList", "orderedList"].includes(node.type ?? "")) {
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
 */
export function getCommittedHtmlWithBlockIds(editor: {
  getHTML: () => string;
}): string {
  const html = editor.getHTML();
  return html.replace(/\s*class="[^"]*"/g, "");
}

/**
 * Gets the document position of a suggestion by its ID.
 */
export function getSuggestionPosition(
  editor: { state: EditorState },
  suggestionId: string
): number | null {
  const state = pluginKey.getState(editor.state);
  if (!state) {
    return null;
  }

  const suggestion = state.suggestions.get(suggestionId);
  if (!suggestion || suggestion.operations.length === 0) {
    return null;
  }

  const found = findBlockByBlockId(
    editor.state.doc,
    suggestion.operations[0].targetBlockId
  );
  return found ? found.pos + 1 : null;
}

// ============================================================================
// Extension
// ============================================================================

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
      activeSuggestions: new Map<string, SuggestionData>(),
      activeSuggestionIds: [] as string[],
      highlightedSuggestionId: null as string | null,
    };
  },

  addProseMirrorPlugins() {
    return [createPlugin(() => this.storage.highlightedSuggestionId)];
  },

  addCommands() {
    return {
      applySuggestion:
        (options: ApplySuggestionOptions) =>
        ({ tr, state, dispatch }) => {
          const { id, targetBlockId, content } = options;

          const found = findBlockByBlockId(state.doc, targetBlockId);
          if (!found) {
            return false;
          }

          const oldContent = found.node.textContent;

          const suggestion: StoredSuggestion = {
            id,
            operations: [{ targetBlockId, newContent: content }],
          };

          if (dispatch) {
            tr.setMeta(pluginKey, { type: "add", suggestion });
            dispatch(tr);
          }

          // Track in storage for external access.
          this.storage.activeSuggestions.set(id, {
            targetBlockId,
            oldContent,
            newContent: content,
          });
          this.storage.activeSuggestionIds.push(id);

          return true;
        },

      applyLegacySuggestion:
        (options: LegacyApplySuggestionOptions) =>
        ({ tr, state, dispatch }) => {
          const { id, find, replacement } = options;

          const normalizedFind = find
            .replace(/^(?:[-*]|\d+\.)\s+/, "")
            .replace(/\s+$/, "");
          const normalizedReplacement = replacement
            .replace(/^(?:[-*]|\d+\.)\s+/, "")
            .replace(/\s+$/, "");

          const fullText = state.doc.textContent;
          const textIndex = fullText.indexOf(normalizedFind);
          if (textIndex === -1) {
            return false;
          }

          // Find the containing block.
          let blockId: string | null = null;
          let currentOffset = 0;

          state.doc.descendants((node, pos) => {
            if (blockId) {
              return false;
            }
            if (node.isText && node.text) {
              const nodeStart = currentOffset;
              const nodeEnd = currentOffset + node.text.length;

              if (textIndex >= nodeStart && textIndex < nodeEnd) {
                const resolved = state.doc.resolve(pos);
                for (let d = resolved.depth; d >= 0; d--) {
                  const ancestor = resolved.node(d);
                  if (ancestor.isBlock && ancestor.attrs.blockId) {
                    blockId = ancestor.attrs.blockId;
                    return false;
                  }
                }
              }
              currentOffset = nodeEnd;
            }
            return true;
          });

          if (!blockId) {
            return false;
          }

          const suggestion: StoredSuggestion = {
            id,
            operations: [
              {
                targetBlockId: blockId,
                newContent: `<p>${normalizedReplacement}</p>`,
              },
            ],
          };

          if (dispatch) {
            tr.setMeta(pluginKey, { type: "add", suggestion });
            dispatch(tr);
          }

          this.storage.activeSuggestionIds.push(id);

          return true;
        },

      acceptSuggestion:
        (suggestionId: string) =>
        ({ state, tr, dispatch }) => {
          const pluginState = pluginKey.getState(state);
          if (!pluginState) {
            return false;
          }

          const suggestion = pluginState.suggestions.get(suggestionId);
          if (!suggestion) {
            return false;
          }

          if (dispatch) {
            const schema = state.schema;

            // Apply all operations in this suggestion.
            for (const op of suggestion.operations) {
              const found = findBlockByBlockId(tr.doc, op.targetBlockId);
              if (!found) {
                continue;
              }

              const { node: blockNode, pos: blockPos } = found;
              const newNode = parseHTMLToBlock(op.newContent, schema, blockNode);
              if (!newNode) {
                continue;
              }

              // Replace block content with new content.
              const from = blockPos + 1;
              const to = blockPos + blockNode.nodeSize - 1;
              tr.replaceWith(from, to, newNode.content);
            }

            tr.setMeta(pluginKey, { type: "remove", id: suggestionId });
            dispatch(tr);
          }

          this.storage.activeSuggestions.delete(suggestionId);
          this.storage.activeSuggestionIds = this.storage.activeSuggestionIds.filter(
            (id: string) => id !== suggestionId
          );

          return true;
        },

      rejectSuggestion:
        (suggestionId: string) =>
        ({ state, tr, dispatch }) => {
          const pluginState = pluginKey.getState(state);
          if (!pluginState) {
            return false;
          }

          if (!pluginState.suggestions.has(suggestionId)) {
            return false;
          }

          if (dispatch) {
            tr.setMeta(pluginKey, { type: "remove", id: suggestionId });
            dispatch(tr);
          }

          this.storage.activeSuggestions.delete(suggestionId);
          this.storage.activeSuggestionIds = this.storage.activeSuggestionIds.filter(
            (id: string) => id !== suggestionId
          );

          return true;
        },

      acceptAllSuggestions:
        () =>
        ({ commands }) => {
          const ids = [...this.storage.activeSuggestionIds];
          return ids.every((id) => commands.acceptSuggestion(id));
        },

      rejectAllSuggestions:
        () =>
        ({ commands }) => {
          const ids = [...this.storage.activeSuggestionIds];
          return ids.every((id) => commands.rejectSuggestion(id));
        },

      setHighlightedSuggestion:
        (suggestionId: string | null) =>
        ({ tr, dispatch, view }) => {
          this.storage.highlightedSuggestionId = suggestionId;

          if (dispatch) {
            tr.setMeta(pluginKey, { type: "highlight", id: suggestionId });
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
