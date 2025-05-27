import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  EditorSuggestion,
  EditorSuggestions,
} from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { filterSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";

interface MentionDropdownState {
  isOpen: boolean;
  query: string;
  suggestions: EditorSuggestion[];
  selectedIndex: number;
  triggerRect: DOMRect | null;
}

export const useMentionDropdown = (
  editor: Editor | null,
  editorSuggestions: EditorSuggestions
) => {
  const [state, setState] = useState<MentionDropdownState>({
    isOpen: false,
    query: "",
    suggestions: [],
    selectedIndex: 0,
    triggerRect: null,
  });

  const commandRef = useRef<
    ((props: { id: string; label: string }) => void) | null
  >(null);

  const updateSuggestions = useCallback(
    (query: string) => {
      const { suggestions, fallbackSuggestions } = editorSuggestions;
      const filteredSuggestions = filterSuggestions(
        query,
        suggestions,
        fallbackSuggestions
      );

      setState((prev) => ({
        ...prev,
        suggestions: filteredSuggestions,
        query,
        selectedIndex: 0,
      }));
    },
    [editorSuggestions]
  );

  const selectSuggestion = useCallback((suggestion: EditorSuggestion) => {
    if (commandRef.current) {
      commandRef.current({ id: suggestion.id, label: suggestion.label });
    }
    setState((prev) => ({
      ...prev,
      isOpen: false,
      triggerRect: null,
    }));
  }, []);

  const setSelectedIndex = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      selectedIndex: index,
    }));
  }, []);

  const closeDropdown = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      triggerRect: null,
    }));
  }, []);

  // Re-filter suggestions when editorSuggestions change and dropdown is open
  useEffect(() => {
    if (state.isOpen) {
      updateSuggestions(state.query);
    }
  }, [editorSuggestions, state.isOpen, state.query, updateSuggestions]);

  // Create a custom suggestion handler that replaces the tippy-based one
  const getSuggestionHandler = useCallback(() => {
    return {
      items: ({ query }: { query: string }) => {
        const { suggestions, fallbackSuggestions } = editorSuggestions;
        return filterSuggestions(query, suggestions, fallbackSuggestions);
      },
      render: () => {
        return {
          onStart: (props: any) => {
            if (!props.clientRect) {
              return;
            }

            commandRef.current = props.command;
            const rect = props.clientRect();
            if (!rect) {
              return;
            }

            updateSuggestions(props.query || "");
            setState((prev) => ({
              ...prev,
              isOpen: true,
              triggerRect: rect,
            }));
          },
          onUpdate: (props: any) => {
            if (!props.clientRect) {
              return;
            }

            const rect = props.clientRect();
            if (rect) {
              updateSuggestions(props.query || "");
              setState((prev) => ({
                ...prev,
                triggerRect: rect,
              }));
            }
          },
          onKeyDown: (props: any) => {
            const { event } = props;

            switch (event.key) {
              case "ArrowUp":
                event.preventDefault();
                setState((prev) => ({
                  ...prev,
                  selectedIndex:
                    prev.selectedIndex > 0
                      ? prev.selectedIndex - 1
                      : prev.suggestions.length - 1,
                }));
                return true;
              case "ArrowDown":
                event.preventDefault();
                setState((prev) => ({
                  ...prev,
                  selectedIndex:
                    prev.selectedIndex < prev.suggestions.length - 1
                      ? prev.selectedIndex + 1
                      : 0,
                }));
                return true;
              case "Enter":
              case "Tab":
                event.preventDefault();
                if (state.suggestions[state.selectedIndex]) {
                  selectSuggestion(state.suggestions[state.selectedIndex]);
                }
                return true;
              case "Escape":
                closeDropdown();
                return true;
              default:
                return false;
            }
          },
          onExit: () => {
            closeDropdown();
            commandRef.current = null;
          },
        };
      },
    };
  }, [
    editorSuggestions,
    state.selectedIndex,
    state.suggestions,
    updateSuggestions,
    selectSuggestion,
    closeDropdown,
  ]);

  return {
    isOpen: state.isOpen,
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    triggerRect: state.triggerRect,
    onSelect: selectSuggestion,
    onOpenChange: closeDropdown,
    onSelectedIndexChange: setSelectedIndex,
    getSuggestionHandler,
  };
};
