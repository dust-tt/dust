import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import debounce from "lodash/debounce";

import type { LightWorkspaceType } from "@app/types";

/**
 * Minimal interface for autocomplete - we only need name, handle, description and actions with name/description.
 * This is a simplified version of AssistantBuilderState that contains only the fields needed for API calls.
 */
interface MinimalBuilderState {
  handle: string | null;
  description: string | null;
  actions?: Array<{
    name: string;
    description: string;
  }>;
}

export const AGENT_BUILDER_INSTRUCTIONS_AUTO_COMPLETE_EXTENSION_NAME =
  "agentBuilderInstructionsAutoComplete";

// Create the plugin key outside so it can be shared
const agentBuilderInstructionsAutoCompletePluginKey =
  new PluginKey<DecorationSet>(
    AGENT_BUILDER_INSTRUCTIONS_AUTO_COMPLETE_EXTENSION_NAME
  );

const MINIMUM_TEXT_LENGTH_FOR_SUGGESTIONS = 3;

/**
 * Fetches autocompletion suggestions from the agent builder API.
 * This function is specific to the agent builder instructions context.
 */
const fetchAgentBuilderSuggestions = async (
  currentText: string,
  owner: LightWorkspaceType | null,
  builderState: MinimalBuilderState | null
): Promise<string[]> => {
  if (!owner || currentText.length < MINIMUM_TEXT_LENGTH_FOR_SUGGESTIONS) {
    return [];
  }

  try {
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/builder/suggestions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "autocompletion",
          inputs: {
            name: builderState?.handle ?? null,
            description: builderState?.description ?? null,
            instructions: currentText,
            tools: JSON.stringify(
              builderState?.actions?.map((action) => ({
                name: action.name,
                description: action.description,
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              })) || []
            ),
          },
        }),
      }
    );
    if (!res.ok) {
      console.error("Failed to get suggestions", res);
      return [];
    }
    const data = await res.json();
    return data.suggestions || [];
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return [];
  }
};

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

/**
 * Handles Tab key press to accept the current autocompletion suggestion.
 * Calculates the remaining suggestion text and inserts it into the editor.
 *
 * @param editor - The TipTap editor instance
 * @param storage - The extension's storage containing current suggestion
 * @returns true if suggestion was accepted, false to allow default Tab behavior
 */
const handleTabAcceptSuggestion = (
  editor: any,
  storage: AgentBuilderInstructionsAutoCompleteExtensionStorage
): boolean => {
  const suggestionText = storage.currentSuggestion;
  if (!suggestionText) {
    return false;
  }

  const currentText = getCurrentTextFromView(editor.view);

  // Calculate remaining suggestion using stored normalized data.
  const suggestionMatch = checkSuggestionMatch(
    currentText,
    storage.currentSuggestion,
    storage.normalizedOriginalText,
    storage.normalizedCurrentSuggestion
  );

  const remainingSuggestion = suggestionMatch.isValid
    ? suggestionMatch.remainingSuggestion
    : suggestionText;

  // Insert the remaining suggestion text.
  editor.chain().focus().insertContent(remainingSuggestion).run();

  // Clear suggestion data from storage.
  storage.currentSuggestion = null;
  storage.normalizedOriginalText = null;
  storage.normalizedCurrentSuggestion = null;

  // Clear visual decorations.
  clearSuggestionDecorations(
    editor.view,
    agentBuilderInstructionsAutoCompletePluginKey
  );

  return true;
};

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

  // Check if the normalized suggestion starts with what the user has typed
  if (!normalizedSuggestion.startsWith(typedSinceSuggestion)) {
    return { isValid: false, remainingSuggestion: "" };
  }

  // Return the remaining part of the suggestion (original formatting)
  const remainingSuggestion = suggestion.substring(typedSinceSuggestion.length);

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
      parentNode.style.color = "#9ca3af";
      parentNode.style.fontStyle = "italic";
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

interface AgentBuilderInstructionsAutoCompleteExtensionOptions {
  applySuggestionKey: string;
  owner: LightWorkspaceType | null;
  suggestionDebounce: number;
  getBuilderState: () => MinimalBuilderState | null;
}

interface AgentBuilderInstructionsAutoCompleteExtensionStorage {
  currentSuggestion: string | null;
  suggestions: string[];
  normalizedOriginalText: string | null; // Normalized original text for efficient comparison
  normalizedCurrentSuggestion: string | null; // Normalized suggestion for efficient comparison
}

/**
 * TipTap extension that provides autocomplete suggestions for agent builder instructions.
 * This extension is specifically designed for the new agent builder and provides
 * AI-powered instruction completion based on the current agent context.
 */
export const AgentBuilderInstructionsAutoCompleteExtension = Extension.create<
  AgentBuilderInstructionsAutoCompleteExtensionOptions,
  AgentBuilderInstructionsAutoCompleteExtensionStorage
>({
  name: "agentBuilderInstructionsAutoComplete",

  addStorage() {
    return {
      currentSuggestion: null,
      suggestions: [],
      normalizedOriginalText: null,
      normalizedCurrentSuggestion: null,
    };
  },

  addOptions() {
    return {
      applySuggestionKey: "Tab",
      owner: null,
      suggestionDebounce: 700,
      getBuilderState: () => null,
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const decorations =
          agentBuilderInstructionsAutoCompletePluginKey.getState(editor.state);

        // Check if there's a suggestion visible.
        if (decorations && decorations.find().length > 0) {
          // For now, always accept suggestions (TODO: Add cursor position check if needed).
          return handleTabAcceptSuggestion(editor, this.storage);
        }

        return false; // Allow default tab behavior.
      },
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = agentBuilderInstructionsAutoCompletePluginKey;
    const extensionStorage = this.storage;

    // Simple debounced suggestion function.
    const getSuggestions = debounce(
      async (
        requestText: string,
        cb: (suggestions: string[] | null, originalRequestText: string) => void
      ) => {
        if (requestText.length === 0) {
          cb(null, requestText);
          return;
        }

        try {
          const builderState = this.options.getBuilderState();
          const allSuggestions = await fetchAgentBuilderSuggestions(
            requestText,
            this.options.owner,
            builderState
          );

          if (allSuggestions.length > 0) {
            cb(allSuggestions, requestText);
          } else {
            cb(null, requestText);
          }
        } catch (error) {
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
            return DecorationSet.empty;
          },
          apply(tr, oldValue) {
            if (tr.getMeta(pluginKey)) {
              // Update the decoration state based on the async data.
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

              // Check if current suggestion still matches before fetching new ones.
              const suggestionMatch = checkSuggestionMatch(
                currentText,
                extensionStorage.currentSuggestion,
                extensionStorage.normalizedOriginalText,
                extensionStorage.normalizedCurrentSuggestion
              );

              if (suggestionMatch.isValid) {
                // Cancel any pending API calls since we have a valid suggestion.
                getSuggestions.cancel();

                // Check if there's actually something left to suggest.
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
                  // User has typed the complete suggestion - clear it and storage.
                  clearSuggestionDecorations(view, pluginKey);
                  extensionStorage.currentSuggestion = null;
                  extensionStorage.normalizedOriginalText = null;
                  extensionStorage.normalizedCurrentSuggestion = null;
                }
                return;
              }

              // Current suggestion is no longer valid - clear display immediately but keep storage.
              clearSuggestionDecorations(view, pluginKey);

              // Simple debounced fetch - fetches new suggestions.
              void getSuggestions(
                currentText,
                (suggestions, originalRequestText) => {
                  // Get current text at the time the response arrives.
                  const currentTextNow = getCurrentTextFromView(view);

                  // Always preserve suggestions in the array for potential future use.
                  if (suggestions && suggestions.length > 0) {
                    const cleanedSuggestions = cleanSuggestions(
                      originalRequestText,
                      suggestions
                    );
                    if (cleanedSuggestions.length > 0) {
                      extensionStorage.suggestions.push(...cleanedSuggestions);
                    }
                  }

                  // Validate if this response is still relevant to current text.
                  if (originalRequestText !== currentTextNow) {
                    return;
                  }

                  if (!suggestions) {
                    // Clear decorations only if no suggestions returned.
                    clearSuggestionDecorations(view, pluginKey);
                    return;
                  }

                  // Clean suggestions to remove any duplicate text.
                  const cleanedSuggestions = cleanSuggestions(
                    currentTextNow,
                    suggestions
                  );

                  if (cleanedSuggestions.length === 0) {
                    clearSuggestionDecorations(view, pluginKey);
                    return;
                  }

                  const [suggestion] = cleanedSuggestions;
                  extensionStorage.currentSuggestion = suggestion;
                  // Store normalized versions for efficient comparison.
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
