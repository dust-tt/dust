import type { LightWorkspaceType } from "@dust-tt/client";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { debounce } from "lodash";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";

// Create the plugin key outside so it can be shared
const suggestionPluginKey = new PluginKey<DecorationSet>("suggestion");

interface TextAutoCompleteExtensionOptions {
  applySuggestionKey: string;
  owner: LightWorkspaceType | null;
  suggestionDebounce: number;
}

interface TextAutoCompleteExtensionStorage {
  builderState: AssistantBuilderState | null;
  currentSuggestion: string | null;
  suggestions: string[];
}

export const TextAutoCompleteExtension = Extension.create<
  TextAutoCompleteExtensionOptions,
  TextAutoCompleteExtensionStorage
>({
  name: "suggestion",

  addStorage() {
    return {
      builderState: null,
      currentSuggestion: null,
      suggestions: [],
    };
  },

  addOptions() {
    return {
      applySuggestionKey: "Tab",
      suggestionDebounce: 1500,
      owner: null,
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const decorations = suggestionPluginKey.getState(editor.state);

        // Check if there's a suggestion.
        if (decorations && decorations.find().length > 0) {
          const { selection } = editor.state;
          const { from, to } = selection;

          // Check if cursor is at the end of the content.
          const docSize = editor.state.doc.content.size;
          // TODO: Debug cursor logic here.
          const isAtEnd = true; //from === to && from === docSize;

          console.log("Suggestion exists, cursor at end:", isAtEnd, {
            from,
            to,
            docSize,
          });

          if (isAtEnd) {
            // Get the suggestion text from storage
            const suggestionText = this.storage.currentSuggestion;
            console.log("Current suggestion in storage:", suggestionText);

            if (suggestionText) {
              console.log("Accepting suggestion:", suggestionText);

              // Insert the suggestion text
              editor.chain().focus().insertContent(suggestionText).run();

              // Clear the current suggestion - next suggestion will be shown on next keystroke
              this.storage.currentSuggestion = null;

              // Clear the decorations
              const tr = editor.state.tr;
              tr.setMeta(suggestionPluginKey, {
                decorations: DecorationSet.empty,
              });
              editor.view.dispatch(tr);

              return true; // Prevent default tab behavior
            } else {
              console.log("No suggestion in storage");
            }
          }
        }

        return false; // Allow default tab behavior
      },
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = suggestionPluginKey;
    const extensionStorage = this.storage;

    const fetchSuggestions = async (
      previousText: string
    ): Promise<string[]> => {
      if (!this.options.owner) {
        return [];
      }

      const res = await fetch(
        `/api/w/${this.options.owner.sId}/assistant/builder/suggestions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "autocompletion",
            inputs: {
              name: this.storage.builderState?.handle,
              description: this.storage.builderState?.description,
              instructions: previousText,
              tools:
                this.storage.builderState?.actions?.map((action) => ({
                  name: action.name,
                  description: action.description,
                })) || [],
            },
          }),
        }
      );
      if (!res.ok) {
        console.error("Failed to get suggestions", res);
        return [];
      }
      const data = await res.json();
      console.log("Got suggestions:", data);
      return data.suggestions || [];
    };

    // Simple debounced suggestion function - like the original working version.
    const getSuggestions = debounce(
      async (
        previousText: string,
        cb: (suggestions: string[] | null) => void
      ) => {
        console.log("Fetching suggestion for:", previousText);
        try {
          const suggestions = await fetchSuggestions(previousText);
          console.log("Got suggestions:", suggestions);

          if (suggestions.length > 0) {
            cb(suggestions);
          } else {
            cb(null);
          }
        } catch (error) {
          console.error("Error fetching suggestions:", error);
          cb(null);
        }
      },
      this.options.suggestionDebounce
    );

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            console.log("AutoComplete plugin initialized");
            return DecorationSet.empty;
          },
          apply(tr, oldValue) {
            if (tr.getMeta(pluginKey)) {
              // Update the decoration state based on the async data
              const { decorations } = tr.getMeta(pluginKey);
              return decorations;
            }
            return tr.docChanged ? oldValue.map(tr.mapping, tr.doc) : oldValue;
          },
        },
        view() {
          return {
            update(view, prevState) {
              // This will add the widget decoration at the cursor position.
              const selection = view.state.selection;
              const cursorPos = selection.$head.pos;
              const nextNode = view.state.doc.nodeAt(cursorPos);

              // If cursor is not at block end and we have suggestion => hide
              // suggestion.
              if (
                nextNode &&
                !nextNode.isBlock &&
                pluginKey.getState(view.state)?.find().length
              ) {
                const tr = view.state.tr;
                tr.setMeta("addToHistory", false);
                tr.setMeta(pluginKey, { decorations: DecorationSet.empty });
                view.dispatch(tr);
                return;
              }

              // If the document didn't change, do nothing.
              if (prevState && prevState.doc.eq(view.state.doc)) {
                return;
              }

              // Reset the suggestion before fetching a new one.
              setTimeout(() => {
                const tr = view.state.tr;
                tr.setMeta("addToHistory", false);
                tr.setMeta(pluginKey, { decorations: DecorationSet.empty });
                view.dispatch(tr);
              }, 0);

              // Fetch a new suggestion.
              const currentText = view.state.doc.textBetween(
                0,
                view.state.doc.content.size,
                " "
              );
              console.log("Fetching suggestion for:", currentText);

              // Simple debounced fetch like the original.
              void getSuggestions(currentText, (suggestions) => {
                console.log("Got suggestions:", suggestions);
                if (!suggestions) {
                  return;
                }

                if (suggestions) {
                  extensionStorage.suggestions.push(...suggestions);
                }

                const [suggestion] = suggestions;
                extensionStorage.currentSuggestion = suggestion;

                const updatedState = view.state;
                const cursorPos = updatedState.selection.$head.pos;
                const suggestionDecoration = Decoration.widget(
                  cursorPos,
                  () => {
                    const parentNode = document.createElement("span");
                    const addSpace = nextNode && nextNode.isText ? " " : "";
                    parentNode.innerHTML = `${addSpace}${suggestion}`;
                    parentNode.style.color = "#9ca3af";
                    parentNode.style.fontStyle = "italic";
                    parentNode.classList.add("autocomplete-suggestion");
                    return parentNode;
                  },
                  { side: 1 }
                );

                const decorations = DecorationSet.create(updatedState.doc, [
                  suggestionDecoration,
                ]);
                const tr = view.state.tr;
                tr.setMeta("addToHistory", false);
                tr.setMeta(pluginKey, { decorations });
                view.dispatch(tr);
              });
            },
          };
        },
        props: {
          decorations(editorState) {
            return pluginKey.getState(editorState);
          },

          handleKeyDown(view, event) {
            if (event.key === "Tab") {
              const decorations = pluginKey.getState(view.state);
              // If there is a decoration, we have a suggestion.
              if (decorations && decorations.find().length > 0) {
                event.preventDefault();
                // Find the suggestion text and insert it.
                const decoration = decorations.find()[0];
                const suggestionElement = decoration.spec.widget;
                if (suggestionElement) {
                  const suggestionText = suggestionElement.textContent || "";
                  const { selection } = view.state;
                  const tr = view.state.tr.insertText(
                    suggestionText,
                    selection.from
                  );
                  tr.setMeta(pluginKey, { decorations: DecorationSet.empty });
                  view.dispatch(tr);
                  return true;
                }
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
