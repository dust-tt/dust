import { BLOCK_ID_ATTRIBUTE } from "@app/components/editor/extensions/agent_builder/BlockIdExtension";
import { INSTRUCTIONS_ROOT_NODE_NAME } from "@app/components/editor/extensions/agent_builder/InstructionsRootExtension";
import { Extension } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { DOMSerializer, DOMParser as PMDOMParser } from "@tiptap/pm/model";
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
  referenceNode: PMNode
): PMNode | null {
  const domParser = PMDOMParser.fromSchema(schema);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const parsed = domParser.parse(tempDiv);

  // The agent builder schema enforces doc > instructionsRoot > blocks.
  // When we parse HTML like "<p>text</p>", the parser returns:
  // doc > instructionsRoot > paragraph
  // We need to unwrap and find the actual content node (paragraph).
  let result: PMNode | null = null;

  const searchForMatch = (node: PMNode) => {
    if (result) {
      return;
    }

    if (node.type === referenceNode.type) {
      result = node;
      return;
    }

    node.content.forEach((child: PMNode) => {
      searchForMatch(child);
    });
  };

  parsed.content.forEach((child: PMNode) => {
    searchForMatch(child);
  });

  return result;
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

      const newNode = parseHTMLToBlock(op.newContent, schema, blockNode);
      if (!newNode) {
        continue;
      }

      const changes = diffBlockContent(blockNode, newNode, schema);
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
                span.className = isHighlighted
                  ? CLASSES.add
                  : CLASSES.addDimmed;
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
                blockNode
              );
              if (!newNode) {
                continue;
              }

              const from = blockPos + 1;
              const to = blockPos + blockNode.nodeSize - 1;
              tr.replaceWith(from, to, newNode.content);
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
