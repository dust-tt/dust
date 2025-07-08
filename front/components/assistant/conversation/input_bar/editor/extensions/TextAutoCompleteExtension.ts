import type { LightWorkspaceType } from "@dust-tt/client";
import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { debounce } from "lodash";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";

// Create the plugin key outside so it can be shared
const suggestionPluginKey = new PluginKey<DecorationSet>("suggestion");

/**
 * Helper function to normalize text by replacing multiple whitespace characters
 * (spaces, tabs, newlines) with single spaces for comparison purposes.
 * This allows suggestions to remain valid even when users add spaces or line breaks.
 */
const normalizeWhitespace = (text: string): string => {
  return text.replace(/\s+/g, " ");
};

function getCurrentTextFromView(view: EditorView) {
  return view.state.doc.textBetween(0, view.state.doc.content.size);
}

// Helper function to check if current suggestion is still valid
const checkSuggestionMatch = (
  currentText: string,
  suggestion: string | null,
  normalizedOriginalText: string | null,
  normalizedSuggestion: string | null
): { isValid: boolean; remainingSuggestion: string } => {
  if (!suggestion || !normalizedOriginalText || !normalizedSuggestion) {
    return { isValid: false, remainingSuggestion: "" };
  }

  console.log("Checking suggestion match:", {
    currentText,
    suggestion,
    normalizedOriginalText,
  });

  // Normalize current text only once
  const normalizedCurrent = normalizeWhitespace(currentText);

  // Check if normalized current text starts with normalized original text
  if (!normalizedCurrent.startsWith(normalizedOriginalText)) {
    return { isValid: false, remainingSuggestion: "" };
  }

  // Get the part the user has typed since the suggestion was generated (normalized)
  const typedSinceSuggestion = normalizedCurrent.substring(
    normalizedOriginalText.length
  );

  console.log("Typed since suggestion (normalized):", typedSinceSuggestion);

  // Check if the normalized suggestion starts with what the user has typed
  if (!normalizedSuggestion.startsWith(typedSinceSuggestion)) {
    return { isValid: false, remainingSuggestion: "" };
  }

  // Return the remaining part of the suggestion (original formatting)
  const remainingSuggestion = suggestion.substring(typedSinceSuggestion.length);
  console.log("Remaining suggestion:", remainingSuggestion);

  return { isValid: true, remainingSuggestion };
};

// Helper function to create suggestion decoration.
const createSuggestionDecoration = (
  doc: Node,
  cursorPos: number,
  suggestionText: string,
  nextNode: Node | null
): DecorationSet => {
  const suggestionDecoration = Decoration.widget(
    cursorPos,
    () => {
      const parentNode = document.createElement("span");
      const addSpace = nextNode && nextNode.isText ? " " : "";
      parentNode.innerHTML = `${addSpace}${suggestionText}`;
      // TODO(2025-07-08): Add class `autocomplete-suggestion` to our style.
      parentNode.style.color = "#9ca3af";
      parentNode.style.fontStyle = "italic";
      parentNode.classList.add("autocomplete-suggestion");
      return parentNode;
    },
    { side: 1 }
  );

  return DecorationSet.create(doc, [suggestionDecoration]);
};

/**
 * Helper function to clear all suggestion decorations from the editor view.
 * Centralizes the decoration clearing logic to avoid duplication.
 */
const clearSuggestionDecorations = (
  view: EditorView,
  pluginKey: PluginKey<DecorationSet>
): void => {
  const tr = view.state.tr;
  tr.setMeta("addToHistory", false);
  tr.setMeta(pluginKey, { decorations: DecorationSet.empty });
  view.dispatch(tr);
};

/**
 * Cleans up suggestions that may contain duplicate text already present in the current text.
 * Sometimes the API returns suggestions that include text the user has already typed.
 * This function removes the overlapping portion to show only the new text to be suggested.
 *
 * @param currentText - The current text in the editor
 * @param rawSuggestions - Array of raw suggestions from the API
 * @returns Array of cleaned suggestions with duplicated text removed
 */
const cleanSuggestions = (
  currentText: string,
  rawSuggestions: string[]
): string[] => {
  const trimmedCurrentText = currentText.trim();

  console.log("Cleaning suggestions:", {
    currentText,
    trimmedCurrentText,
    rawSuggestions,
  });

  return rawSuggestions
    .map((suggestion) => {
      // If the suggestion starts with the current text, remove the duplicate part.
      if (suggestion.startsWith(trimmedCurrentText)) {
        return suggestion.substring(currentText.length);
      }

      // Try to find overlap at the end of current text with the beginning of suggestion
      // For example: currentText = "You are a Sa", suggestion = "Sales person"
      // We want to find that "Sa" overlaps with "Sales" and return "les person".
      let overlap = 0;
      const maxOverlap = Math.min(currentText.length, suggestion.length);

      for (let i = 1; i <= maxOverlap; i++) {
        const endOfCurrent = currentText.slice(-i);
        const startOfSuggestion = suggestion.slice(0, i);

        if (endOfCurrent === startOfSuggestion) {
          overlap = i;
        }
      }

      if (overlap > 0) {
        return suggestion.substring(overlap);
      }

      // No overlap found, return the suggestion as-is.
      return suggestion;
    })
    .filter((suggestion) => suggestion.length > 0); // Remove empty suggestions.
};

interface TextAutoCompleteExtensionOptions {
  applySuggestionKey: string;
  owner: LightWorkspaceType | null;
  suggestionDebounce: number;
}

interface TextAutoCompleteExtensionStorage {
  builderState: AssistantBuilderState | null;
  currentSuggestion: string | null;
  suggestions: string[];
  normalizedOriginalText: string | null; // Normalized original text for efficient comparison
  normalizedCurrentSuggestion: string | null; // Normalized suggestion for efficient comparison
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
      normalizedOriginalText: null,
      normalizedCurrentSuggestion: null,
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

              // Get current text to calculate remaining suggestion.
              const currentText = getCurrentTextFromView(editor.view);

              // Use helper function to get remaining suggestion.
              const suggestionMatch = checkSuggestionMatch(
                currentText,
                this.storage.currentSuggestion,
                this.storage.normalizedOriginalText,
                this.storage.normalizedCurrentSuggestion
              );

              const remainingSuggestion = suggestionMatch.isValid
                ? suggestionMatch.remainingSuggestion
                : suggestionText;

              // Insert only the remaining suggestion text.
              editor.chain().focus().insertContent(remainingSuggestion).run();

              // Clear the current suggestion - next suggestion will be shown on next keystroke.
              this.storage.currentSuggestion = null;
              this.storage.normalizedOriginalText = null;
              this.storage.normalizedCurrentSuggestion = null;

              // Clear the decorations.
              clearSuggestionDecorations(editor.view, suggestionPluginKey);

              return true; // Prevent default tab behavior.
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
              name: this.storage.builderState?.handle ?? null,
              description: this.storage.builderState?.description ?? null,
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
        requestText: string,
        cb: (suggestions: string[] | null, originalRequestText: string) => void
      ) => {
        if (requestText.length === 0) {
          cb(null, requestText);
          return;
        }

        console.log("Fetching suggestion for:", requestText);
        try {
          const suggestions = await fetchSuggestions(requestText);
          console.log("Got suggestions:", suggestions);

          if (suggestions.length > 0) {
            cb(suggestions, requestText);
          } else {
            cb(null, requestText);
          }
        } catch (error) {
          console.error("Error fetching suggestions:", error);
          cb(null, requestText);
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
                clearSuggestionDecorations(view, pluginKey);
                return;
              }

              // If the document didn't change, do nothing.
              if (prevState && prevState.doc.eq(view.state.doc)) {
                return;
              }

              // Fetch a new suggestion.
              const currentText = getCurrentTextFromView(view);
              console.log("Checking suggestion for:", currentText);

              // Check if current suggestion still matches before fetching new ones
              const suggestionMatch = checkSuggestionMatch(
                currentText,
                extensionStorage.currentSuggestion,
                extensionStorage.normalizedOriginalText,
                extensionStorage.normalizedCurrentSuggestion
              );

              if (suggestionMatch.isValid) {
                console.log(
                  "Current suggestion still matches, using existing:",
                  extensionStorage.currentSuggestion
                );

                // Cancel any pending API calls since we have a valid suggestion
                getSuggestions.cancel();
                console.log(
                  "Cancelled pending API call - using stored suggestion"
                );

                // Check if there's actually something left to suggest
                if (suggestionMatch.remainingSuggestion.length > 0) {
                  // Display the remaining suggestion (update existing decoration).
                  const updatedState = view.state;
                  const cursorPos = updatedState.selection.$head.pos;
                  const decorations = createSuggestionDecoration(
                    updatedState.doc,
                    cursorPos,
                    suggestionMatch.remainingSuggestion,
                    nextNode
                  );
                  const tr = view.state.tr;
                  tr.setMeta("addToHistory", false);
                  tr.setMeta(pluginKey, { decorations });
                  view.dispatch(tr);
                } else {
                  // User has typed the complete suggestion - clear it and storage
                  console.log("User completed the suggestion, clearing");
                  clearSuggestionDecorations(view, pluginKey);
                  extensionStorage.currentSuggestion = null;
                  extensionStorage.normalizedOriginalText = null;
                  extensionStorage.normalizedCurrentSuggestion = null;
                }
                return;
              }

              // Current suggestion is no longer valid - clear display immediately but keep storage
              console.log(
                "Current suggestion no longer matches, clearing display (keeping storage for potential backspace)"
              );
              clearSuggestionDecorations(view, pluginKey);

              console.log("Need to fetch new suggestion for:", currentText);

              // Simple debounced fetch - fetches new suggestions.
              void getSuggestions(
                currentText,
                (suggestions, originalRequestText) => {
                  console.log(
                    "Got raw suggestions:",
                    suggestions,
                    "for request:",
                    originalRequestText
                  );

                  // Get current text at the time the response arrives
                  const currentTextNow = getCurrentTextFromView(view);

                  // Always preserve suggestions in the array for potential future use
                  if (suggestions && suggestions.length > 0) {
                    const cleanedSuggestions = cleanSuggestions(
                      originalRequestText,
                      suggestions
                    );
                    if (cleanedSuggestions.length > 0) {
                      extensionStorage.suggestions.push(...cleanedSuggestions);
                      console.log(
                        "Preserved suggestions in array:",
                        cleanedSuggestions
                      );
                    }
                  }

                  // Validate if this response is still relevant to current text
                  if (originalRequestText !== currentTextNow) {
                    console.log(
                      "Ignoring stale API response. Request was for:",
                      originalRequestText,
                      "but current text is:",
                      currentTextNow
                    );
                    return;
                  }

                  if (!suggestions) {
                    // Clear decorations only if no suggestions returned
                    clearSuggestionDecorations(view, pluginKey);
                    return;
                  }

                  // Clean suggestions to remove any duplicate text.
                  const cleanedSuggestions = cleanSuggestions(
                    currentTextNow,
                    suggestions
                  );
                  console.log(
                    "Cleaned suggestions for current context:",
                    cleanedSuggestions
                  );

                  if (cleanedSuggestions.length === 0) {
                    clearSuggestionDecorations(view, pluginKey);
                    return;
                  }

                  const [suggestion] = cleanedSuggestions;
                  extensionStorage.currentSuggestion = suggestion;
                  // Store normalized versions for efficient comparison
                  extensionStorage.normalizedOriginalText =
                    normalizeWhitespace(currentTextNow);
                  extensionStorage.normalizedCurrentSuggestion =
                    normalizeWhitespace(suggestion);

                  const updatedState = view.state;
                  const cursorPos = updatedState.selection.$head.pos;
                  const decorations = createSuggestionDecoration(
                    updatedState.doc,
                    cursorPos,
                    suggestion,
                    nextNode
                  );
                  const tr = view.state.tr;
                  tr.setMeta("addToHistory", false);
                  tr.setMeta(pluginKey, { decorations });
                  view.dispatch(tr);
                }
              );
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
