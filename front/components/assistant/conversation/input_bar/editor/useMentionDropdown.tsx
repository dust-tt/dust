import type { Editor } from "@tiptap/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
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

export type SuggestionProps = {
  command: CommandFunction;
  range: Range;
  query: string;
  clientRect?: (() => DOMRect | null) | null;
};

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
  const clientRectRef = useRef<(() => DOMRect | null) | null>(null);

  // Store the current suggestion range for text replacement
  const rangeRef = useRef<Range | null>(null);

  // Use refs to store current state for the onKeyDown handler to avoid stale closure
  const currentStateRef = useRef(state);
  currentStateRef.current = state;

  const updateQuery = (query: string) => {
    setState((prev) => ({
      ...prev,
      query,
      selectedIndex: 0,
    }));
  };

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

  const recalculateTriggerRect = useCallback(() => {
    if (clientRectRef.current && state.isOpen) {
      const rect = clientRectRef.current();
      if (rect) {
        setState((prev) => ({
          ...prev,
          triggerRect: rect,
        }));
      }
    }
  }, [state.isOpen]);

  // Handle window resize to recalculate cursor position
  useEffect(() => {
    if (state.isOpen) {
      const handleResize = () => {
        recalculateTriggerRect();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [state.isOpen, recalculateTriggerRect]);

  // Single source of truth: filter suggestions whenever data or query changes
  useEffect(() => {
    const filteredSuggestions = filterSuggestions(
      state.query,
      editorSuggestions.suggestions,
      editorSuggestions.fallbackSuggestions
    );

    setState((prev) => ({
      ...prev,
      isLoading: editorSuggestions.isLoading,
      suggestions: filteredSuggestions,
    }));
  }, [
    editorSuggestions.suggestions,
    editorSuggestions.fallbackSuggestions,
    editorSuggestions.isLoading,
    state.query,
  ]);

  const getSuggestionHandler = () => {
    return {
      render: () => {
        return {
          onStart: (props: SuggestionProps) => {
            if (!props.clientRect) {
              return;
            }

            commandRef.current = props.command;
            clientRectRef.current = props.clientRect;
            // Store the range for text replacement
            rangeRef.current = props.range;

            const rect = props.clientRect();
            if (!rect) {
              return;
            }

            updateQuery(props.query || "");
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
            clientRectRef.current = props.clientRect;

            const rect = props.clientRect();
            if (rect) {
              updateQuery(props.query || "");
              setState((prev) => ({
                ...prev,
                triggerRect: rect,
              }));
            }
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
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
              case " ":
                if (currentState.isOpen) {
                  event.preventDefault();
                  if (currentState.suggestions[currentState.selectedIndex]) {
                    selectSuggestion(
                      currentState.suggestions[currentState.selectedIndex]
                    );
                  }
                  return true;
                } else {
                  const firstSuggestion = currentState.suggestions[0];
                  if (
                    firstSuggestion &&
                    currentState.query === firstSuggestion.label
                  ) {
                    event.preventDefault();
                    selectSuggestion(firstSuggestion);
                    return true;
                  }
                  return false;
                }
              default:
                return false;
            }
          },
          onExit: () => {
            closeDropdown();
            commandRef.current = null;
            clientRectRef.current = null;
            rangeRef.current = null;
          },
        };
      },
    };
  };

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
