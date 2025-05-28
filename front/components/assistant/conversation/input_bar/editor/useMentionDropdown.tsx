import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  EditorSuggestion,
  EditorSuggestions,
} from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { filterSuggestions } from "@app/components/assistant/conversation/input_bar/editor/suggestion";

interface CommandFunction {
  (props: { id: string; label: string }): void;
}

interface Range {
  from: number;
  to: number;
}

interface SuggestionProps {
  command: CommandFunction;
  range: Range;
  query: string;
  clientRect: () => DOMRect | null;
}

export interface MentionDropdownState {
  isOpen: boolean;
  query: string;
  suggestions: EditorSuggestion[];
  selectedIndex: number;
  triggerRect: DOMRect | null;
  isLoading: boolean;
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
    isLoading: editorSuggestions.isLoading,
  });

  const commandRef = useRef<CommandFunction | null>(null);

  // Store the current suggestion range for text replacement
  const rangeRef = useRef<Range | null>(null);

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

      setState((prev) => {
        // Only update if query or suggestions actually changed
        if (
          prev.query === query &&
          prev.suggestions.length === filteredSuggestions.length &&
          prev.suggestions.every(
            (item, index) => item.id === filteredSuggestions[index]?.id
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          suggestions: filteredSuggestions,
          query,
          selectedIndex: 0,
        };
      });
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
      const { suggestions, fallbackSuggestions } = editorSuggestions;
      const filteredSuggestions = filterSuggestions(
        state.query,
        suggestions,
        fallbackSuggestions
      );

      setState((prev) => {
        // Only update if suggestions actually changed by comparing length and content
        if (
          prev.suggestions.length === filteredSuggestions.length &&
          prev.suggestions.every(
            (item, index) => item.id === filteredSuggestions[index]?.id
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          suggestions: filteredSuggestions,
          selectedIndex: 0,
        };
      });
    }
  }, [editorSuggestions, state.isOpen, state.query]);

  // Update loading state when editorSuggestions.isLoading changes
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isLoading: editorSuggestions.isLoading,
    }));
  }, [editorSuggestions.isLoading]);

  const getSuggestionHandler = () => {
    return {
      items: ({ query }: { query: string }) => {
        const { suggestions, fallbackSuggestions } = editorSuggestions;
        return filterSuggestions(query, suggestions, fallbackSuggestions);
      },
      render: () => {
        return {
          onStart: (props: SuggestionProps) => {
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
          onUpdate: (props: SuggestionProps) => {
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
  }

  return {
    isOpen: state.isOpen,
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    triggerRect: state.triggerRect,
    isLoading: state.isLoading,
    onSelect: selectSuggestion,
    onOpenChange: closeDropdown,
    onSelectedIndexChange: setSelectedIndex,
    getSuggestionHandler,
  };
};
