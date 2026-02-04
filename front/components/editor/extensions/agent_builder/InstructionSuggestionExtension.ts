import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactMarkViewRenderer } from "@tiptap/react";

import SuggestionMarkView from "@app/components/editor/extensions/agent_builder/SuggestionMarkView";

export const SuggestionMark = Mark.create({
  name: "suggestion",
  spanning: true,

  addAttributes() {
    return {
      suggestionId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion-id"),
        renderHTML: (attributes) => {
          if (!attributes.suggestionId) {
            return {};
          }
          return { "data-suggestion-id": attributes.suggestionId };
        },
      },
      oldString: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-old"),
        renderHTML: (attributes) => {
          if (!attributes.oldString) {
            return {};
          }
          return { "data-old": attributes.oldString };
        },
      },
      newString: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-new"),
        renderHTML: (attributes) => {
          if (!attributes.newString) {
            return {};
          }
          return { "data-new": attributes.newString };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-suggestion-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "suggestion-mark" }),
      0,
    ];
  },

  addMarkView() {
    return ReactMarkViewRenderer(SuggestionMarkView);
  },

  // TODO: Add darker highlighting for selected suggestion.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("suggestionHighlight"),
        props: {
          decorations(state) {
            const { from } = state.selection;
            const $pos = state.doc.resolve(from);
            const marks = $pos.marks();

            const selectedMark = marks.find(
              (m) => m.type.name === "suggestion"
            );
            if (!selectedMark) {
              return null;
            }

            const selectedId = selectedMark.attrs.suggestionId;
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.isText) {
                node.marks.forEach((mark) => {
                  if (
                    mark.type.name === "suggestion" &&
                    mark.attrs.suggestionId === selectedId
                  ) {
                    decorations.push(
                      Decoration.inline(pos, pos + node.nodeSize, {
                        class: "suggestion-selected",
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
 * Gets the committed text content from the editor, excluding pending suggestions.
 * Returns the markdown as it would be if all suggestions were rejected.
 */
export function getCommittedTextContent(editor: Editor): string {
  const markdownManager = editor.markdown;
  if (!markdownManager) {
    throw new Error(
      "Markdown extension is required for InstructionSuggestionExtension"
    );
  }

  const json = editor.getJSON();
  const filteredJson = filterSuggestionNewText(json);

  return markdownManager.serialize(filteredJson);
}

/**
 * Recursively processes suggestion marks to show only oldString (committed state).
 * For text nodes with suggestion marks, keeps only the oldString content.
 */
function filterSuggestionNewText(node: JSONContent): JSONContent {
  if (node.type === "text") {
    const suggestionMark = node.marks?.find(
      (mark) => mark.type === "suggestion"
    );
    if (suggestionMark) {
      // Return oldString without the mark (committed state).
      return {
        type: "text",
        text: (suggestionMark.attrs?.oldString as string) || "",
      };
    }
    return node;
  }

  if (!node.content) {
    return node;
  }

  const filteredContent = node.content
    .map(filterSuggestionNewText)
    .filter((child) => !(child.type === "text" && !child.text));

  return {
    ...node,
    content: filteredContent.length > 0 ? filteredContent : undefined,
  };
}

// Unicode Private Use Area markers for position finding.
const START_MARKER = "\uE000";
const END_MARKER = "\uE001";

interface MarkerPosition {
  from: number;
  to: number;
}

/**
 * Finds positions in ProseMirror document using marker-based approach.
 *
 * 1. Get current markdown from editor
 * 2. Insert unique markers around the target string in markdown
 * 3. Parse the marked markdown back to a ProseMirror Node
 * 4. Find marker positions in the parsed Node's text content
 * 5. The text offsets directly give us ProseMirror-compatible positions
 */
function findPositionWithMarkers(
  editor: Editor,
  searchString: string
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

  return { from: startIdx, to: endIdx };
}

interface SuggestionNode {
  from: number;
  to: number;
  suggestionId: string;
  newString: string;
}

/**
 * Collects all suggestion marks in the document.
 */
function collectSuggestionNodes(state: EditorState): SuggestionNode[] {
  const nodes: SuggestionNode[] = [];

  state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }
    const mark = node.marks.find((m) => m.type.name === "suggestion");
    if (mark && mark.attrs.suggestionId) {
      nodes.push({
        from: pos,
        to: pos + node.nodeSize,
        suggestionId: mark.attrs.suggestionId as string,
        newString: (mark.attrs.newString as string) || "",
      });
    }
  });

  return nodes;
}

/**
 * Processes a suggestion: either accept (replace with newString) or reject (remove mark).
 */
function processSuggestion(
  state: EditorState,
  tr: Transaction,
  suggestionId: string,
  accept: boolean
): boolean {
  const nodes = collectSuggestionNodes(state).filter(
    (n) => n.suggestionId === suggestionId
  );

  if (nodes.length === 0) {
    return false;
  }

  // Sort by position descending to process from end to start.
  nodes.sort((a, b) => b.from - a.from);

  const { schema } = state;

  for (const node of nodes) {
    if (accept) {
      // Replace with newString.
      tr.replaceWith(node.from, node.to, schema.text(node.newString));
    } else {
      // Just remove the mark, keep original text.
      tr.removeMark(node.from, node.to, schema.marks.suggestion);
    }
  }

  return true;
}

/**
 * Processes all suggestions in the document.
 */
function processAllSuggestions(
  state: EditorState,
  tr: Transaction,
  accept: boolean
): boolean {
  const nodes = collectSuggestionNodes(state);

  if (nodes.length === 0) {
    return false;
  }

  // Sort by position descending to process from end to start.
  nodes.sort((a, b) => b.from - a.from);

  const { schema } = state;

  for (const node of nodes) {
    if (accept) {
      tr.replaceWith(node.from, node.to, schema.text(node.newString));
    } else {
      tr.removeMark(node.from, node.to, schema.marks.suggestion);
    }
  }

  return true;
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
            const markerPosition = findPositionWithMarkers(editor, find);

            if (!markerPosition) {
              return false;
            }

            from = markerPosition.from;
            to = markerPosition.to;

            if (from === -1 || to === -1) {
              return false;
            }
          }

          if (dispatch) {
            const suggestionMark = schema.marks.suggestion.create({
              suggestionId: id,
              oldString: find,
              newString: replacement,
            });

            if (find.length === 0) {
              // Pure insertion.
              const textNode = schema.text(replacement, [suggestionMark]);
              tr.insert(from, textNode);
            } else {
              // Mark existing text.
              tr.addMark(from, to, suggestionMark);
            }

            dispatch(tr);
          }

          this.storage.activeSuggestionIds.push(id);

          return true;
        },

      acceptSuggestion:
        (suggestionId: string) =>
        ({ state, tr }) => {
          const modified = processSuggestion(state, tr, suggestionId, true);

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
          const modified = processSuggestion(state, tr, suggestionId, false);

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
          const modified = processAllSuggestions(state, tr, true);

          if (modified) {
            this.storage.activeSuggestionIds = [];
          }

          return modified;
        },

      rejectAllSuggestions:
        () =>
        ({ state, tr }) => {
          const modified = processAllSuggestions(state, tr, false);

          if (modified) {
            this.storage.activeSuggestionIds = [];
          }

          return modified;
        },
    };
  },
});
