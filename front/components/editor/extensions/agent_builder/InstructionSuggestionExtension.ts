import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactMarkViewRenderer } from "@tiptap/react";

import SuggestionMarkView from "@app/components/editor/extensions/agent_builder/SuggestionMarkView";

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

  addMarkView() {
    return ReactMarkViewRenderer(SuggestionMarkView);
  },

  // TODO: Add back darker highlighting for selected suggestion.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('suggestionHighlight'),
        props: {
          decorations(state) {
            const { from } = state.selection;
            const $pos = state.doc.resolve(from);
            const marks = $pos.marks();

            console.log(">>> Current marks at cursor:", marks);

            // Find the selected suggestion mark
            const selectedMark = marks.find(m => m.type.name === 'suggestion');
            console.log(">>> Selected suggestion mark:", selectedMark);
            if (!selectedMark) {
              return null;
            }

            const selectedId = selectedMark.attrs.suggestionId;
            const decorations: Decoration[] = [];

            // Find all text nodes with this suggestion and add decoration
            state.doc.descendants((node, pos) => {
              if (node.isText) {
                node.marks.forEach(mark => {
                  console.log(">> Checking mark:", mark);
                  if (mark.type.name === 'suggestion' &&
                      mark.attrs.suggestionId === selectedId) {
                    decorations.push(
                      Decoration.inline(pos, pos + node.nodeSize, {
                        class: 'suggestion-selected',
                      })
                    );
                  }
                });
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
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
const START_MARKER = '\uE000';
const END_MARKER = '\uE001';

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
): MarkerPosition | null {
  const markdown = editor.getMarkdown();
  const markdownIndex = markdown.indexOf(searchString);
  if (markdownIndex === -1) {
    return null;
  }

  const markdownManager = editor.markdown;
  if (!markdownManager) {
    throw new Error(
      "Markdown extension is required for InstructionSuggestionExtension"
    );
  }

  // Insert markers in markdown.
  const markedMarkdown =
    markdown.slice(0, markdownIndex) +
    START_MARKER +
    markdown.slice(markdownIndex, markdownIndex + searchString.length) +
    END_MARKER +
    markdown.slice(markdownIndex + searchString.length);

  // Parse to ProseMirror.
  const parsedJSON = markdownManager.parse(markedMarkdown);
  const parsedDoc = Node.fromJSON(editor.state.schema, parsedJSON);

  const injectStr = (sourceStr: string, index: number, newStr: string) => {
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

  // Find markers in offset-aligned text.
  const startIdx = offsetText.indexOf(START_MARKER);
  const endIdx = offsetText.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    return null;
  }

  // ✅ These positions ARE document positions!
  return {
    from: startIdx,
    to: endIdx,
  };
}

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
      activeSuggestionIds: [] as string[],
    };
  },

  addExtensions() {
    return [SuggestionMark];
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
