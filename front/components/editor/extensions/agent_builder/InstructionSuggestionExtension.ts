import { BLOCK_ID_ATTRIBUTE } from "@app/components/editor/extensions/agent_builder/BlockIdExtension";
import { INSTRUCTIONS_ROOT_NODE_NAME } from "@app/components/editor/extensions/agent_builder/InstructionsRootExtension";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { Extension } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import {
  DOMSerializer,
  DOMParser as PMDOMParser,
  Fragment,
} from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Transform } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ChangeSet } from "prosemirror-changeset";

// A single block operation within a suggestion.
interface BlockOperation {
  targetBlockId: string;
  newContent: string; // HTML content.
}

// A stored suggestion with its operations.
interface StoredSuggestion {
  id: string;
  operations: BlockOperation[];
}

interface PluginState {
  suggestions: Map<string, StoredSuggestion>;
  highlightedId: string | null;
  decorations: DecorationSet;
}

// Change range from diffing old vs new content.
export interface BlockChange {
  fromA: number; // Range in old content.
  toA: number;
  fromB: number; // Range in new content.
  toB: number;
}

const pluginKey = new PluginKey<PluginState>("suggestionPlugin");

export const SUGGESTION_ID_ATTRIBUTE = "data-suggestion-id";

const CLASSES = {
  remove:
    "suggestion-deletion rounded line-through bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200",
  removeDimmed:
    "suggestion-deletion rounded line-through bg-red-50 dark:bg-red-900/20 text-gray-400",
  add: "suggestion-addition rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200",
  addDimmed:
    "suggestion-addition rounded bg-blue-50 dark:bg-blue-900/20 text-gray-400",
};

export function diffBlockContent(
  oldNode: PMNode,
  newNode: PMNode,
  schema: Schema
): BlockChange[] {
  // Empty old content means everything in newNode is an addition.
  if (oldNode.content.size === 0) {
    return [{ fromA: 0, toA: 0, fromB: 0, toB: newNode.content.size }];
  }

  // Cross-type replacement: new content isn't valid inside old node type, so we can't use
  // Transform.replaceWith for fine-grained diffing.
  // Return a single change covering everything as removed + added.
  if (oldNode.type !== newNode.type) {
    return [
      {
        fromA: 0,
        toA: oldNode.content.size,
        fromB: 0,
        toB: newNode.content.size,
      },
    ];
  }

  // If the schema has an `instructionsRoot` node and the target node isn't one,
  // we must wrap it: doc > instructionsRoot > block. This satisfies the schema
  // constraint that `doc` only accepts `instructionsRoot` children.
  const needsRoot =
    schema.nodes[INSTRUCTIONS_ROOT_NODE_NAME] !== undefined &&
    oldNode.type.name !== INSTRUCTIONS_ROOT_NODE_NAME;

  const blockNode = schema.node(
    oldNode.type.name,
    oldNode.attrs,
    oldNode.content
  );
  const docChildren = needsRoot
    ? [schema.node(INSTRUCTIONS_ROOT_NODE_NAME, null, [blockNode])]
    : [blockNode];
  const oldDoc = schema.node("doc", null, docChildren);

  // Extra nesting adds +1 to positions inside the content.
  const offset = needsRoot ? 2 : 1;

  const tr = new Transform(oldDoc);
  tr.replaceWith(offset, oldNode.content.size + offset, newNode.content);

  const changeSet = ChangeSet.create(oldDoc).addSteps(
    tr.doc,
    tr.mapping.maps,
    null
  );

  return changeSet.changes.map((change) => ({
    fromA: change.fromA - offset,
    toA: change.toA - offset,
    fromB: change.fromB - offset,
    toB: change.toB - offset,
  }));
}

function parseHTMLToBlock(
  html: string,
  schema: Schema,
  targetBlockId: string
): PMNode | null {
  const domParser = PMDOMParser.fromSchema(schema);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const parsed = domParser.parse(tempDiv);

  // The agent builder schema enforces doc > instructionsRoot > blocks.
  // When we parse HTML like "<p>text</p>", the parser returns:
  // doc > instructionsRoot > paragraph
  // For single-block targets we unwrap past the instructionsRoot to get the
  // block node. When the target is the instructionsRoot itself, we return it
  // directly so all child blocks are preserved.
  let container: PMNode = parsed;
  const first = container.firstChild;
  if (first?.type.name === INSTRUCTIONS_ROOT_NODE_NAME) {
    if (targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID) {
      return first;
    }

    return first.firstChild ?? null;
  }

  return container.firstChild ?? null;
}

function findBlockByBlockId(
  doc: PMNode,
  targetBlockId: string
): { node: PMNode; pos: number } | null {
  let result: { node: PMNode; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (result) {
      return false;
    }

    if (node.attrs[BLOCK_ID_ATTRIBUTE] === targetBlockId) {
      result = { node, pos };

      return false;
    }

    return true;
  });

  return result;
}

// Create inline diff decorations for a single block (deletion + addition widgets).
function buildBlockDecorations({
  blockPos,
  decorations,
  isHighlighted,
  newNode,
  oldNode,
  schema,
  suggestionId,
}: {
  blockPos: number;
  decorations: Decoration[];
  isHighlighted: boolean;
  newNode: PMNode;
  oldNode: PMNode;
  schema: Schema;
  suggestionId: string;
}): void {
  const changes = diffBlockContent(oldNode, newNode, schema);
  const contentStart = blockPos + 1;

  for (const change of changes) {
    if (change.fromA !== change.toA) {
      decorations.push(
        Decoration.inline(
          contentStart + change.fromA,
          contentStart + change.toA,
          {
            class: isHighlighted ? CLASSES.remove : CLASSES.removeDimmed,
            [SUGGESTION_ID_ATTRIBUTE]: suggestionId,
          }
        )
      );
    }

    if (change.fromB !== change.toB) {
      const insertedSlice = newNode.content.cut(change.fromB, change.toB);

      decorations.push(
        Decoration.widget(
          contentStart + change.fromA,
          () => {
            const span = document.createElement("span");
            span.className = isHighlighted ? CLASSES.add : CLASSES.addDimmed;
            span.setAttribute(SUGGESTION_ID_ATTRIBUTE, suggestionId);
            span.contentEditable = "false";

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

// Create per-child-block decorations for root-level targets. Matches old and
// new children by position and diffs each pair for word-level inline diffs.
// Extra new blocks are shown as full additions, extra old blocks as deletions.
function buildRootDecorations({
  decorations,
  isHighlighted,
  newRoot,
  oldRoot,
  rootPos,
  schema,
  suggestionId,
}: {
  decorations: Decoration[];
  isHighlighted: boolean;
  newRoot: PMNode;
  oldRoot: PMNode;
  rootPos: number;
  schema: Schema;
  suggestionId: string;
}): void {
  const oldChildren: PMNode[] = [];
  const newChildren: PMNode[] = [];
  oldRoot.content.forEach((child) => oldChildren.push(child));
  newRoot.content.forEach((child) => newChildren.push(child));

  const maxLen = Math.max(oldChildren.length, newChildren.length);
  let oldOffset = 0;

  for (let i = 0; i < maxLen; i++) {
    const oldChild = oldChildren[i];
    const newChild = newChildren[i];
    // Position of this old child block within the document.
    const childPos = rootPos + 1 + oldOffset;

    if (oldChild && newChild) {
      // Both exist: diff within this block pair.
      buildBlockDecorations({
        blockPos: childPos,
        newNode: newChild,
        oldNode: oldChild,
        schema,
        suggestionId,
        isHighlighted,
        decorations,
      });
      oldOffset += oldChild.nodeSize;
    } else if (oldChild) {
      // Block was removed: mark entire block content as deletion.
      const contentStart = childPos + 1;
      decorations.push(
        Decoration.inline(contentStart, contentStart + oldChild.content.size, {
          class: isHighlighted ? CLASSES.remove : CLASSES.removeDimmed,
          [SUGGESTION_ID_ATTRIBUTE]: suggestionId,
        })
      );
      oldOffset += oldChild.nodeSize;
    } else if (newChild) {
      // Block was added: insert as a widget after the last old child.
      decorations.push(
        Decoration.widget(
          childPos,
          () => {
            const div = document.createElement("div");
            div.className = isHighlighted ? CLASSES.add : CLASSES.addDimmed;
            div.setAttribute(SUGGESTION_ID_ATTRIBUTE, suggestionId);
            div.contentEditable = "false";

            const serializer = DOMSerializer.fromSchema(schema);
            serializer.serializeFragment(Fragment.from(newChild), {}, div);

            return div;
          },
          { side: -1 }
        )
      );
    }
  }
}

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
      const found = findBlockByBlockId(state.doc, op.targetBlockId);
      if (!found) {
        continue;
      }

      const { node: blockNode, pos: blockPos } = found;

      const newNode = parseHTMLToBlock(op.newContent, schema, op.targetBlockId);
      if (!newNode) {
        continue;
      }

      // For root-level targets, diff per-child block so that word-level diffs stay within their
      // block and block boundaries are preserved. For single-block targets, diff the block directly.
      if (
        blockNode.type.name === INSTRUCTIONS_ROOT_NODE_NAME &&
        newNode.type.name === INSTRUCTIONS_ROOT_NODE_NAME
      ) {
        buildRootDecorations({
          oldRoot: blockNode,
          newRoot: newNode,
          rootPos: blockPos,
          schema,
          suggestionId,
          isHighlighted,
          decorations,
        });
      } else {
        buildBlockDecorations({
          oldNode: blockNode,
          newNode,
          blockPos,
          schema,
          suggestionId,
          isHighlighted,
          decorations,
        });
      }
    }
  }

  return DecorationSet.create(state.doc, decorations);
}

function createPlugin(getHighlightedId: () => string | null) {
  return new Plugin<PluginState>({
    key: pluginKey,

    state: {
      init(): PluginState {
        return {
          decorations: DecorationSet.empty,
          highlightedId: null,
          suggestions: new Map(),
        };
      },

      apply(tr, value, _oldState, newState): PluginState {
        const meta = tr.getMeta(pluginKey);
        let { suggestions, highlightedId } = value;
        let dirty = false;

        if (meta?.type === "add") {
          suggestions = new Map(suggestions);
          suggestions.set(meta.suggestion.id, meta.suggestion);
          dirty = true;
        }

        if (meta?.type === "remove") {
          suggestions = new Map(suggestions);
          suggestions.delete(meta.id);
          dirty = true;
        }

        if (meta?.type === "highlight") {
          highlightedId = meta.id;
          dirty = true;
        }

        if (dirty || tr.docChanged) {
          const effectiveHighlightedId = highlightedId ?? getHighlightedId();
          return {
            suggestions,
            highlightedId,
            decorations: buildDecorations(
              newState,
              suggestions,
              effectiveHighlightedId
            ),
          };
        }

        return value;
      },
    },

    props: {
      decorations(editorState) {
        return (
          pluginKey.getState(editorState)?.decorations ?? DecorationSet.empty
        );
      },
    },
  });
}

export interface ApplySuggestionOptions {
  id: string;
  targetBlockId: string;
  // HTML content for the block (e.g., '<p>New text with <strong>bold</strong></p>').
  content: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionSuggestion: {
      acceptAllSuggestions: () => ReturnType;
      acceptSuggestion: (suggestionId: string) => ReturnType;
      applySuggestion: (options: ApplySuggestionOptions) => ReturnType;
      rejectAllSuggestions: () => ReturnType;
      rejectSuggestion: (suggestionId: string) => ReturnType;
      setHighlightedSuggestion: (suggestionId: string | null) => ReturnType;
    };
  }

  interface Storage {
    instructionSuggestion: {
      highlightedSuggestionId: string | null;
    };
  }
}

export function getActiveSuggestions(
  state: EditorState
): Map<string, StoredSuggestion> {
  return pluginKey.getState(state)?.suggestions ?? new Map();
}

export function getActiveSuggestionIds(state: EditorState): string[] {
  return Array.from(getActiveSuggestions(state).keys());
}

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

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
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

          if (!findBlockByBlockId(state.doc, targetBlockId)) {
            return false;
          }

          if (dispatch) {
            const suggestion: StoredSuggestion = {
              id,
              operations: [{ targetBlockId, newContent: content }],
            };
            tr.setMeta(pluginKey, { type: "add", suggestion });
            dispatch(tr);
          }

          return true;
        },

      acceptSuggestion:
        (suggestionId: string) =>
        ({ state, tr, dispatch }) => {
          const pluginState = pluginKey.getState(state);
          const suggestion = pluginState?.suggestions.get(suggestionId);
          if (!suggestion) {
            return false;
          }

          if (dispatch) {
            const schema = state.schema;

            for (const op of suggestion.operations) {
              const found = findBlockByBlockId(tr.doc, op.targetBlockId);
              if (!found) {
                continue;
              }

              const { node: blockNode, pos: blockPos } = found;
              const newNode = parseHTMLToBlock(
                op.newContent,
                schema,
                op.targetBlockId
              );
              if (!newNode) {
                continue;
              }

              if (blockNode.type === newNode.type) {
                // Same type: replace inner content.
                const from = blockPos + 1;
                const to = blockPos + blockNode.nodeSize - 1;
                tr.replaceWith(from, to, newNode.content);
              } else {
                // Cross-type: replace the entire block node.
                tr.replaceWith(
                  blockPos,
                  blockPos + blockNode.nodeSize,
                  newNode
                );
              }
            }

            tr.setMeta(pluginKey, { type: "remove", id: suggestionId });
            dispatch(tr);
          }

          return true;
        },

      rejectSuggestion:
        (suggestionId: string) =>
        ({ state, tr, dispatch }) => {
          if (!pluginKey.getState(state)?.suggestions.has(suggestionId)) {
            return false;
          }

          if (dispatch) {
            tr.setMeta(pluginKey, { type: "remove", id: suggestionId });
            dispatch(tr);
          }

          return true;
        },

      acceptAllSuggestions:
        () =>
        ({ commands, editor }) => {
          const ids = getActiveSuggestionIds(editor.state);

          // Process all suggestions even if some fail, return true only if all succeeded.
          return ids.map((id) => commands.acceptSuggestion(id)).every(Boolean);
        },

      rejectAllSuggestions:
        () =>
        ({ commands, editor }) => {
          const ids = getActiveSuggestionIds(editor.state);

          // Process all suggestions even if some fail, return true only if all succeeded.
          return ids.map((id) => commands.rejectSuggestion(id)).every(Boolean);
        },

      setHighlightedSuggestion:
        (suggestionId: string | null) =>
        ({ tr, dispatch }) => {
          this.storage.highlightedSuggestionId = suggestionId;

          if (dispatch) {
            tr.setMeta(pluginKey, { type: "highlight", id: suggestionId });
            dispatch(tr);
          }

          return true;
        },
    };
  },
});
