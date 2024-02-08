import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";

import { MentionList } from "@app/components/assistant/conversation/input_bar/editor/MentionList";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";

export interface EditorSuggestion {
  id: string;
  label: string;
  pictureUrl: string;
}

export interface EditorSuggestions {
  suggestions: EditorSuggestion[];
  fallbackSuggestions: EditorSuggestion[];
}

const SUGGESTION_DISPLAY_LIMIT = 7;

function filterAndSortSuggestions(
  lowerCaseQuery: string,
  suggestions: EditorSuggestion[]
) {
  return suggestions
    .filter((item) => subFilter(lowerCaseQuery, item.label.toLowerCase()))
    .sort((a, b) => compareForFuzzySort(lowerCaseQuery, a.label, b.label));
}

export function makeGetAssistantSuggestions(allSuggestions: EditorSuggestions) {
  return {
    items: ({ query }: { query: string }): EditorSuggestion[] => {
      const { suggestions, fallbackSuggestions } = allSuggestions;

      const lowerCaseQuery = query.toLowerCase();

      const inListSuggestions = filterAndSortSuggestions(
        lowerCaseQuery,
        suggestions
      ).slice(0, SUGGESTION_DISPLAY_LIMIT);

      // If there is enough suggestions from the user's list use them.
      if (inListSuggestions.length >= SUGGESTION_DISPLAY_LIMIT) {
        return inListSuggestions;
      }

      // Otherwise, fallback to all the suggestions.
      const allSuggestionsNoDuplicates = filterAndSortSuggestions(
        lowerCaseQuery,
        fallbackSuggestions
      ).filter((item) => !inListSuggestions.find((i) => i.id === item.id));

      // Sorts user's list suggestions alphabetically first,
      // then appends and sorts remaining suggestions alphabetically,
      // without sorting the combined list again.
      const combinedSuggestions = [
        ...inListSuggestions,
        ...allSuggestionsNoDuplicates,
      ].slice(0, SUGGESTION_DISPLAY_LIMIT);

      return combinedSuggestions;
    },

    render: () => {
      let reactRenderer: any;
      let popup: any;

      return {
        onStart: (props: any) => {
          if (!props.clientRect) {
            return;
          }

          reactRenderer = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: reactRenderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: any) {
          reactRenderer.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          });
        },

        onKeyDown(props: any) {
          if (props.event.key === "Escape") {
            popup[0].hide();

            return true;
          }

          return reactRenderer.ref?.onKeyDown(props);
        },

        onExit() {
          popup[0].destroy();
          reactRenderer.destroy();
        },
      };
    },
  };
}
