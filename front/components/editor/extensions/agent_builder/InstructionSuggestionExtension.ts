import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactMarkViewRenderer } from "@tiptap/react";

import SuggestionMarkView from "@app/components/editor/extensions/agent_builder/NodeView";

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

export const SuggestionMark = Mark.create({
  name: 'suggestion',
  spanning: true,

  addAttributes() {
    return {
      suggestionId: {
        default: null,
        parseHTML: element => element.getAttribute('data-suggestion-id'),
        renderHTML: attributes => {
          if (!attributes.suggestionId) {return {};}
          return { 'data-suggestion-id': attributes.suggestionId };
        },
      },
      oldString: {
        default: null,
        parseHTML: element => element.getAttribute('data-old'),
        renderHTML: attributes => {
          if (!attributes.oldString) {return {};}
          return { 'data-old': attributes.oldString };
        },
      },
      newString: {
        default: null,
        parseHTML: element => element.getAttribute('data-new'),
        renderHTML: attributes => {
          if (!attributes.newString) {return {};}
          return { 'data-new': attributes.newString };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-suggestion-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'suggestion-mark',
      }),
      0,
    ];
  },

  // ✅ Add the NodeView
  addMarkView() {
    return ReactMarkViewRenderer(SuggestionMarkView);
  },
});

// // Apply only to existing text, store both strings in mark
// function applySuggestion(editor, oldString, newString) {
//   const position = findPositionInMarkdown(editor, oldString);

//   editor.commands.command(({ state, dispatch, tr }) => {
//     const mark = state.schema.marks.suggestion.create({
//       suggestionId: generateId(),
//       oldString,
//       newString,
//     });

//     tr.addMark(position.from, position.to, mark);
//     if (dispatch) {dispatch(tr);}
//     return true;
//   });
// }

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
 * Gets the committed text content from the editor, excluding suggestion addition marks.
 * This returns the markdown as it would be without any pending suggestions.
 */
export function getCommittedTextContent(editor: Editor): string {
  const markdownManager = editor.markdown;
  if (!markdownManager) {
    throw new Error(
      "Markdown extension is required for InstructionSuggestionExtension"
    );
  }

  const json = editor.getJSON();
  const filteredJson = filterAdditionMarks(json);

  return markdownManager.serialize(filteredJson);
}

/**
 * Recursively filters out text nodes with suggestionAddition marks from JSONContent.
 * This preserves the document structure but removes suggested additions.
 */
function filterAdditionMarks(node: JSONContent): JSONContent {
  // Text node: exclude if it has an addition mark.
  if (node.type === "text") {
    const hasAddition = node.marks?.some(
      (mark) => mark.type === "suggestionAddition"
    );
    if (hasAddition) {
      // Return empty text node (will be filtered out by parent).
      return { type: "text", text: "" };
    }
    return node;
  }

  // Non-text node: recursively filter content.
  if (!node.content) {
    return node;
  }

  const filteredContent = node.content
    .map(filterAdditionMarks)
    .filter((child) => {
      // Remove empty text nodes.
      if (child.type === "text" && !child.text) {
        return false;
      }

      return true;
    });

  return {
    ...node,
    content: filteredContent.length > 0 ? filteredContent : undefined,
  };
}

interface MarkerPosition {
  from: number;
  to: number;
}

// Unicode Private Use Area base for markers.
const MARKER_BASE = '\uE000';


/**
 * Finds positions in ProseMirror document using marker-based approach.
 *
 * The approach:
 * 1. Get current markdown from editor
 * 2. Insert unique markers around the target string in markdown
 * 3. Parse the marked markdown back to a ProseMirror Node
 * 4. Find marker positions in the parsed Node's text content
 * 5. The text offsets directly give us ProseMirror-compatible positions
 *
 * This handles markdown formatting correctly because we work with the actual
 * markdown representation that gets parsed back to ProseMirror.
 */
function findPositionWithMarkers(
  editor: Editor,
  searchString: string,
  suggestionId: string
): MarkerPosition | null {
  const markdown = editor.getMarkdown();
  const markdownIndex = markdown.indexOf(searchString);

  if (markdownIndex === -1) {
    return null;
  }

  const startMarker = '\uE000';
  const endMarker = '\uE001';

  // Insert markers in markdown
  const markedMarkdown =
    markdown.slice(0, markdownIndex) +
    startMarker +
    markdown.slice(markdownIndex, markdownIndex + searchString.length) +
    endMarker +
    markdown.slice(markdownIndex + searchString.length);

  // Parse to ProseMirror
  const parsedJSON = editor.markdown.parse(markedMarkdown);
  const parsedDoc = Node.fromJSON(editor.state.schema, parsedJSON);

  // ✅ Create offset-aligned string using the technique from the forum
  const injectStr = (sourceStr, index, newStr) => {
    return (
      sourceStr.slice(0, index) +
      newStr +
      sourceStr.slice(index + newStr.length, sourceStr.length)
    );
  };

  let offsetText = new Array(parsedDoc.content.size).join(" ");

  parsedDoc.descendants((node, pos) => {
    if (node.isText && node.text) {
      offsetText = injectStr(offsetText, pos, node.text);
    }
  });

  // Find markers in offset-aligned text
  const startIdx = offsetText.indexOf(startMarker);
  const endIdx = offsetText.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    return null;
  }

  // ✅ These positions ARE document positions!
  return {
    from: startIdx,
    to: endIdx,
  };
}

/**
 * Maps a text offset to a ProseMirror document position.
 * Text offset is the character position in doc.textContent.
 */
function textOffsetToDocPosition(doc: Node, textOffset: number): number {
  let currentTextOffset = 0;
  let result = -1;

  doc.descendants((node, pos) => {
    if (result !== -1) {
      return false;
    }

    if (node.isText && node.text) {
      const nodeStart = currentTextOffset;
      const nodeEnd = currentTextOffset + node.text.length;

      if (textOffset >= nodeStart && textOffset <= nodeEnd) {
        result = pos + (textOffset - nodeStart);
        return false;
      }

      currentTextOffset = nodeEnd;
    }
    return true;
  });

  return result;
}

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
      activeSuggestionIds: [] as string[],
    };
  },

  addExtensions() {
    return [SuggestionAdditionMark, SuggestionDeletionMark, SuggestionMark];
  },

  addProseMirrorPlugins() {
    return [suggestionHighlightPlugin];
  },

  addCommands() {
    return {
      applySuggestion:
        (options: ApplySuggestionOptions) =>
        ({ tr, state, dispatch, editor }) => {
          const { id, find, replacement } = options;
          const { doc, schema } = state;

          let from: number;
          let to: number;

          // Handle empty find (insertion at beginning).
          if (find.length === 0) {
            // Find first text position or default to position 1.
            let firstTextPos = -1;
            doc.descendants((node, pos) => {
              if (firstTextPos === -1 && node.isText) {
                firstTextPos = pos;
                return false;
              }
              return firstTextPos === -1;
            });
            from = firstTextPos === -1 ? 1 : firstTextPos;
            to = from;
          } else {
            console.log('>>> APPLYING:', { find, replacement });
            // Use marker-based approach for accurate markdown handling.
            const markerPosition = findPositionWithMarkers(
              editor,
              find,
              id
            );

            if (!markerPosition) {
              return false;
            }

            // Convert text offsets to document positions.
            from = markerPosition.from;
            to = markerPosition.to;

                  // ✅ ADD DEBUG HERE - BEFORE applying the mark
      console.log('=== DEBUG POSITIONS ===');
      console.log('searchString (find):', find);
      console.log('Positions from markers:', { from, to });
      console.log('Length:', to - from);
      console.log('state.doc.textContent length:', doc.textContent.length);
      console.log('Text at position:', doc.textBetween(from, to));
      console.log('Does it match?', doc.textBetween(from, to) === find);
      console.log('======================');

            if (from === -1 || to === -1) {
              return false;
            }
          }

          // // Simple approach: show old text (red/strikethrough) then new text (blue).
          // // No word-level diffing, users accept/reject the whole suggestion.
          // const deletionMark = schema.marks.suggestionDeletion.create({
          //   suggestionId: id,
          // });
          // const additionMark = schema.marks.suggestionAddition.create({
          //   suggestionId: id,
          // });

          // Apply the transaction: replace old text with [old marked as deletion] + [new marked as addition].
          if (dispatch) {
            // tr.delete(from, to);

            const suggestionMark = schema.marks.suggestion.create({
              suggestionId: id,
              oldString: find,
              newString: replacement,
            });

            // For pure insertion (find is empty)
            if (find.length === 0) {
              const textNode = schema.text(replacement, [suggestionMark]);
              tr.insert(from, textNode);
            } else {
              // Just mark the existing text!
              tr.addMark(from, to, suggestionMark);
            }

            // let insertPos = from;

            // // Insert old text with deletion mark (if not empty).
            // if (find.length > 0) {
            //   const deletionNode = schema.text(find, [deletionMark]);
            //   tr.insert(insertPos, deletionNode);
            //   insertPos += deletionNode.nodeSize;
            // }

            // // Insert new text with addition mark (if not empty).
            // if (replacement.length > 0) {
            //   const additionNode = schema.text(replacement, [
            //     additionMark,
            //   ]);
            //   tr.insert(insertPos, additionNode);
            // }

            dispatch(tr);

            console.log("Applied suggestion:", state.doc);
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
        ({ state, tr }) => {
          // // Process all suggestions in a single transaction to avoid
          // // intermediate state issues with chained commands.
          // const modified = processAllSuggestionMarks(state, tr, {
          //   markToDelete: "suggestionDeletion",
          //   markToKeep: "suggestionAddition",
          // });

          // if (modified) {
          //   this.storage.activeSuggestionIds = [];
          // }

          // return modified;
        },

      rejectAllSuggestions:
        () =>
        ({ state, tr }) => {
          // // Process all suggestions in a single transaction to avoid
          // // intermediate state issues with chained commands.
          // const modified = processAllSuggestionMarks(state, tr, {
          //   markToDelete: "suggestionAddition",
          //   markToKeep: "suggestionDeletion",
          // });

          // if (modified) {
          //   this.storage.activeSuggestionIds = [];
          // }

          // return modified;
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
