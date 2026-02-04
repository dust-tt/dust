import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Fragment, Node } from "@tiptap/pm/model";
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

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: "", // Don't add any markdown syntax
          close: "", // Don't add any markdown syntax
          // This makes the mark "invisible" to markdown serialization
        },
      },
    };
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
      setHighlightedSuggestion: (suggestionId: string | null) => ReturnType;
    };
  }

  interface Storage {
    instructionSuggestion: {
      activeSuggestionIds: string[];
      highlightedSuggestionId: string | null;
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
 * Finds ProseMirror document positions for a markdown string using the marker technique.
 *
 * ## The Challenge
 * We need to find where a markdown string (like "**bold text**") appears in the ProseMirror
 * document. Direct text search doesn't work because markdown syntax (**, __, ##, etc.) gets
 * stripped during parsing. For example:
 * - Markdown: "**bold**" (8 chars)
 * - ProseMirror: "bold" (4 chars, with a mark)
 *
 * ## The Solution (Marker Technique)
 * 1. Insert invisible Unicode markers around the target string in the markdown
 * 2. Parse the marked markdown to ProseMirror
 * 3. The markers survive parsing and appear in the document at the correct positions
 * 4. Find the markers to get the ProseMirror positions
 *
 * ## Key Insight: Offset-Aligned String
 * ProseMirror positions are NOT simple character offsets. They account for node boundaries.
 * We create an "offset-aligned string" where character index = ProseMirror position.
 * This technique comes from the ProseMirror community:
 * https://discuss.prosemirror.net/t/thoughts-on-offsets-and-positions/706
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

  // Step 1: Insert invisible Unicode markers around the target string in markdown.
  // These markers are Unicode Private Use Area characters that won't interfere with parsing.
  const markedMarkdown =
    markdown.slice(0, markdownIndex) +
    START_MARKER +
    markdown.slice(markdownIndex, markdownIndex + searchString.length) +
    END_MARKER +
    markdown.slice(markdownIndex + searchString.length);

  // Step 2: Parse the marked markdown to a ProseMirror document
  // The markers will survive the markdown→ProseMirror transformation
  const parsedJSON = markdownManager.parse(markedMarkdown);
  const parsedDoc = Node.fromJSON(editor.state.schema, parsedJSON);

  // Step 3: Create an "offset-aligned string"
  // This is a string where character index directly corresponds to ProseMirror position.
  // We do this by creating a string with spaces, then injecting text at their doc positions.

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

  // Step 4: Find where the markers ended up in the offset-aligned text
  // Because offsetText index = doc position, these indices ARE the ProseMirror positions!
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
 * Parses markdown string and returns ProseMirror nodes for inline content.
 * Falls back to plain text if parsing fails.
 */
function parseMarkdownToNodes(editor: Editor, markdown: string): Node | Node[] {
  const markdownManager = editor.markdown;
  if (!markdownManager) {
    return editor.state.schema.text(markdown);
  }

  const parsed = markdownManager.parse(markdown);
  const doc = Node.fromJSON(editor.state.schema, parsed);

  // Extract inline content from the parsed document.
  // The parsed doc is typically: doc > paragraph > inline content
  const firstBlock = doc.firstChild;
  if (firstBlock && firstBlock.content.size > 0) {
    const nodes: Node[] = [];
    firstBlock.content.forEach((node) => nodes.push(node));
    return nodes.length === 1 ? nodes[0] : nodes;
  }

  return editor.state.schema.text(markdown);
}

/**
 * Processes a suggestion: either accept (replace with newString as markdown) or reject (remove mark).
 */
function processSuggestion(
  editor: Editor,
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
      // Parse newString as markdown and replace.
      const content = parseMarkdownToNodes(editor, node.newString);
      const fragment = Fragment.from(content);
      tr.replaceWith(node.from, node.to, fragment);
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
  editor: Editor,
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
      // Parse newString as markdown and replace.
      const content = parseMarkdownToNodes(editor, node.newString);
      const fragment = Array.isArray(content)
        ? Fragment.from(content)
        : Fragment.from(content);
      tr.replaceWith(node.from, node.to, fragment);
    } else {
      tr.removeMark(node.from, node.to, schema.marks.suggestion);
    }
  }

  return true;
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
        m.type.name === "suggestion" && m.attrs.suggestionId === suggestionId
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
      highlightedSuggestionId: null as string | null,
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

          console.log("=== APPLY SUGGESTION ===");
          console.log("ID:", id);
          console.log("Find (with escaped newlines):", JSON.stringify(find));
          console.log("Replacement:", JSON.stringify(replacement));

          const markdown = editor.getMarkdown();
          console.log("Markdown length:", markdown.length);

          // Check how many times it appears
          let count = 0;
          let pos = 0;
          while ((pos = markdown.indexOf(find, pos)) !== -1) {
            count++;
            console.log(`Found occurrence ${count} at position:`, pos);
            pos += find.length;
          }

          console.log("Total occurrences in markdown:", count);

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
        ({ state, tr, editor }) => {
          const modified = processSuggestion(
            editor,
            state,
            tr,
            suggestionId,
            true
          );

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
        ({ state, tr, editor }) => {
          const modified = processSuggestion(
            editor,
            state,
            tr,
            suggestionId,
            false
          );

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
        ({ state, tr, editor }) => {
          const modified = processAllSuggestions(editor, state, tr, true);

          if (modified) {
            this.storage.activeSuggestionIds = [];
          }

          return modified;
        },

      rejectAllSuggestions:
        () =>
        ({ state, tr, editor }) => {
          const modified = processAllSuggestions(editor, state, tr, false);

          if (modified) {
            this.storage.activeSuggestionIds = [];
          }

          return modified;
        },

      setHighlightedSuggestion:
        (suggestionId: string | null) =>
        ({ tr, dispatch, view }) => {
          this.storage.highlightedSuggestionId = suggestionId;

          if (dispatch) {
            // TODO(2026-01-04 COPILOT): Fix highlight updating.
            // tr.setMeta(suggestionHighlightPluginKey, suggestionId);
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
