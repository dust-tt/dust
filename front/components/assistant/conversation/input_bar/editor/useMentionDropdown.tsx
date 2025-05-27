import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

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
  editorSuggestions: EditorSuggestions,
  editorRef: React.MutableRefObject<Editor | null>
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

  // Store the current suggestion range for text replacement
  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  // Use refs to store current state for the onKeyDown handler to avoid stale closure
  const currentStateRef = useRef(state);
  currentStateRef.current = state;

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

  const selectSuggestion = useCallback(
    (suggestion: EditorSuggestion) => {
      const editor = editorRef.current;

      if (editor && rangeRef.current) {
        // Delete the typed text and insert the mention
        editor
          .chain()
          .focus()
          .deleteRange(rangeRef.current)
          .insertContent({
            type: "mention",
            attrs: { id: suggestion.id, label: suggestion.label },
          })
          .insertContent(" ") // Add space after mention
          .run();
      } else if (commandRef.current) {
        // Fallback to the original command if editor/range not available
        commandRef.current({ id: suggestion.id, label: suggestion.label });
      }

      setState((prev) => ({
        ...prev,
        isOpen: false,
        triggerRect: null,
      }));
    },
    [editorRef]
  );

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
            // Store the range for text replacement
            rangeRef.current = props.range;

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

            // Update the range for text replacement
            rangeRef.current = props.range;

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
            // Use current state ref to avoid stale closure
            const currentState = currentStateRef.current;

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
                if (currentState.suggestions[currentState.selectedIndex]) {
                  selectSuggestion(
                    currentState.suggestions[currentState.selectedIndex]
                  );
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
            rangeRef.current = null;
          },
        };
      },
    };
  }, [editorSuggestions, updateSuggestions, selectSuggestion, closeDropdown]);

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
