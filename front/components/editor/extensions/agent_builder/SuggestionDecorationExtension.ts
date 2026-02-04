import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { DOMSerializer, Fragment, Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// ============================================
// TYPES
// ============================================

interface SuggestionRange {
  from: number;
  to: number;
}

interface Suggestion {
  id: string;
  oldString: string;
  newString: string;
  ranges: SuggestionRange[];
  anchorTo: number; // Where to place the widget
}

interface SuggestionPluginState {
  suggestions: Suggestion[];
}

// ============================================
// PLUGIN KEY
// ============================================

export const suggestionDecorationPluginKey =
  new PluginKey<SuggestionPluginState>("suggestion-decorations");

// ============================================
// HELPER: Explode a range into per-text-node ranges
// ============================================

function explodeToTextRanges(
  doc: Node,
  from: number,
  to: number
): SuggestionRange[] {
  const ranges: SuggestionRange[] = [];

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      const rangeStart = Math.max(pos, from);
      const rangeEnd = Math.min(pos + node.nodeSize, to);

      if (rangeStart < rangeEnd) {
        ranges.push({ from: rangeStart, to: rangeEnd });
      }
    }
  });

  return ranges;
}

// ============================================
// HELPER: Parse markdown to ProseMirror nodes
// ============================================

function parseMarkdownToFragment(editor: Editor, markdown: string): Fragment {
  const markdownManager = editor.markdown;
  if (!markdownManager) {
    return Fragment.from(editor.state.schema.text(markdown));
  }

  const parsed = markdownManager.parse(markdown);
  const doc = Node.fromJSON(editor.state.schema, parsed);

  // Return the full document content (all blocks)
  return doc.content;
}

// ============================================
// HELPER: Create inline new text widget (single-line)
// ============================================

function createInlineNewText(
  editor: Editor,
  suggestion: Suggestion
): HTMLElement {
  const span = document.createElement("span");
  span.className = "suggestion-new-inline";
  span.contentEditable = "false";
  span.setAttribute("data-suggestion-id", suggestion.id);

  // Extract plain text from parsed markdown (strips syntax like -, #, **)
  const parsed = editor.markdown?.parse(suggestion.newString);
  if (parsed) {
    const doc = Node.fromJSON(editor.state.schema, parsed);
    const text = doc.textBetween(0, doc.nodeSize - 2, " ");
    span.textContent = " " + text;
  } else {
    span.textContent = " " + suggestion.newString;
  }

  return span;
}

// ============================================
// HELPER: Create block preview widget (multi-line)
// ============================================

function createBlockPreview(
  editor: Editor,
  suggestion: Suggestion
): HTMLElement {
  const container = document.createElement("div");
  container.className = "suggestion-preview-block";
  container.contentEditable = "false";
  container.setAttribute("data-suggestion-id", suggestion.id);

  const parsed = editor.markdown?.parse(suggestion.newString);
  if (parsed) {
    const doc = Node.fromJSON(editor.state.schema, parsed);
    const serializer = DOMSerializer.fromSchema(editor.state.schema);
    const fragment = serializer.serializeFragment(doc.content);
    container.appendChild(fragment);
  } else {
    container.textContent = suggestion.newString;
  }

  return container;
}

// ============================================
// DECLARE COMMANDS
// ============================================

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    suggestionDecoration: {
      setSuggestionDecorations: (suggestions: Suggestion[]) => ReturnType;
      clearSuggestionDecorations: () => ReturnType;
      removeSuggestionDecoration: (id: string) => ReturnType;
      acceptSuggestionDecoration: (id: string) => ReturnType;
      rejectSuggestionDecoration: (id: string) => ReturnType;
    };
  }
}

// ============================================
// EXTENSION
// ============================================

export const SuggestionDecorationExtension = Extension.create({
  name: "suggestionDecoration",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin<SuggestionPluginState>({
        key: suggestionDecorationPluginKey,

        state: {
          init() {
            return { suggestions: [] };
          },

          apply(tr, pluginState) {
            let { suggestions } = pluginState;

            // Map ranges through document changes
            if (tr.docChanged) {
              suggestions = suggestions
                .map((s) => ({
                  ...s,
                  ranges: s.ranges
                    .map((r) => ({
                      from: tr.mapping.map(r.from),
                      to: tr.mapping.map(r.to),
                    }))
                    .filter((r) => r.from < r.to),
                  anchorTo: tr.mapping.map(s.anchorTo),
                }))
                .filter((s) => s.ranges.length > 0);
            }

            // Handle meta actions
            const meta = tr.getMeta(suggestionDecorationPluginKey) as
              | {
                  setSuggestions?: Suggestion[];
                  removeSuggestion?: string;
                }
              | undefined;

            if (meta?.setSuggestions) {
              suggestions = meta.setSuggestions;
            }

            if (meta?.removeSuggestion) {
              suggestions = suggestions.filter(
                (s) => s.id !== meta.removeSuggestion
              );
            }

            return { suggestions };
          },
        },

        props: {
          decorations(state) {
            const pluginState = suggestionDecorationPluginKey.getState(state);
            if (!pluginState || pluginState.suggestions.length === 0) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];

            pluginState.suggestions.forEach((suggestion) => {
              const isInline = !suggestion.oldString.includes("\n");

              // 1. Strikethrough ALL old text ranges
              suggestion.ranges.forEach((range) => {
                decorations.push(
                  Decoration.inline(range.from, range.to, {
                    class: "suggestion-old",
                    "data-suggestion-id": suggestion.id,
                  })
                );
              });

              // 2. Widget for new text - inline or block based on content
              if (isInline) {
                decorations.push(
                  Decoration.widget(
                    suggestion.anchorTo,
                    () => createInlineNewText(editor, suggestion),
                    {
                      key: `suggestion-text-${suggestion.id}`,
                      side: 1,
                    }
                  )
                );
              } else {
                // For block suggestions, place widget after the last range
                decorations.push(
                  Decoration.widget(
                    suggestion.anchorTo,
                    () => createBlockPreview(editor, suggestion),
                    {
                      key: `suggestion-block-${suggestion.id}`,
                      side: 1,
                    }
                  )
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSuggestionDecorations:
        (suggestions: Suggestion[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(suggestionDecorationPluginKey, {
              setSuggestions: suggestions,
            });
            dispatch(tr);
          }
          return true;
        },

      clearSuggestionDecorations:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(suggestionDecorationPluginKey, { setSuggestions: [] });
            dispatch(tr);
          }
          return true;
        },

      removeSuggestionDecoration:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(suggestionDecorationPluginKey, { removeSuggestion: id });
            dispatch(tr);
          }
          return true;
        },

      acceptSuggestionDecoration:
        (id: string) =>
        ({ tr, state, dispatch, editor }) => {
          const pluginState = suggestionDecorationPluginKey.getState(state);
          const suggestion = pluginState?.suggestions.find((s) => s.id === id);

          if (!suggestion) {
            return false;
          }

          if (dispatch) {
            // Parse the new markdown content
            const fragment = parseMarkdownToFragment(
              editor,
              suggestion.newString
            );

            // Get the full range to replace (from first range start to last range end)
            const firstRange = suggestion.ranges[0];
            const lastRange = suggestion.ranges[suggestion.ranges.length - 1];

            if (firstRange && lastRange) {
              // Replace the entire range with the parsed markdown content
              tr = tr.replaceWith(firstRange.from, lastRange.to, fragment);
            }

            // Remove suggestion
            tr = tr.setMeta(suggestionDecorationPluginKey, {
              removeSuggestion: id,
            });

            dispatch(tr);
          }

          return true;
        },

      rejectSuggestionDecoration:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(suggestionDecorationPluginKey, { removeSuggestion: id });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

// ============================================
// EXPORT HELPER FOR EXTERNAL USE
// ============================================

export { explodeToTextRanges };
export type { Suggestion, SuggestionRange };
