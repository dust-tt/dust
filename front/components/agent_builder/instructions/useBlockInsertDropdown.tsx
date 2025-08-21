import { CommandLineIcon, DocumentIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import { useCallback, useMemo, useRef, useState } from "react";

export interface BlockSuggestion {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  command: (editor: Editor, range: { from: number; to: number }) => void;
}

// Static block suggestions
const BLOCK_SUGGESTIONS: BlockSuggestion[] = [
  {
    id: "xml-block",
    label: "XML Tag",
    icon: DocumentIcon,
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertInstructionBlock("instructions")
        .run();
    },
  },
  {
    id: "code-block",
    label: "Code Block",
    icon: CommandLineIcon,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run();
    },
  },
];

export interface BlockInsertDropdownState {
  isOpen: boolean;
  query: string;
  suggestions: BlockSuggestion[];
  selectedIndex: number;
  triggerRect: DOMRect | null;
}

export const useBlockInsertDropdown = (
  editorRef: React.MutableRefObject<Editor | null>
) => {
  const [state, setState] = useState<BlockInsertDropdownState>({
    isOpen: false,
    query: "",
    suggestions: BLOCK_SUGGESTIONS,
    selectedIndex: 0,
    triggerRect: null,
  });

  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  // Use ref to avoid stale closure in keyboard handler
  const currentStateRef = useRef(state);
  currentStateRef.current = state;

  const filterSuggestions = useCallback((query: string) => {
    if (!query) {
      return BLOCK_SUGGESTIONS;
    }

    const lowerQuery = query.toLowerCase();
    return BLOCK_SUGGESTIONS.filter((item) =>
      item.label.toLowerCase().includes(lowerQuery)
    );
  }, []);

  const updateQuery = useCallback(
    (query: string) => {
      const filtered = filterSuggestions(query);
      setState((prev) => ({
        ...prev,
        query,
        suggestions: filtered,
        selectedIndex: 0,
      }));
    },
    [filterSuggestions]
  );

  const selectSuggestion = useCallback(
    (suggestion: BlockSuggestion) => {
      const editor = editorRef.current;

      if (editor && rangeRef.current) {
        suggestion.command(editor, rangeRef.current);
      }

      setState((prev) => ({
        ...prev,
        isOpen: false,
        triggerRect: null,
      }));
    },
    [editorRef]
  );

  const closeDropdown = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      triggerRect: null,
    }));
  }, []);

  const getSuggestionHandler = useMemo(() => {
    return {
      char: "/",
      command: ({ editor, range, props }: any) => {
        const suggestion = props as BlockSuggestion;
        suggestion.command(editor, range);
      },
      items: ({ query }: { query: string }) => {
        return filterSuggestions(query);
      },
      render: () => {
        return {
          onStart: (props: SuggestionProps) => {
            if (!props.clientRect) {
              return;
            }

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

            rangeRef.current = props.range;

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
                if (currentState.suggestions.length === 0) {
                  return true;
                }
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
                if (currentState.suggestions.length === 0) {
                  return true;
                }
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
                event.preventDefault();
                closeDropdown();
                return true;
              default:
                return false;
            }
          },
          onExit: () => {
            closeDropdown();
            rangeRef.current = null;
          },
        };
      },
    };
  }, [closeDropdown, filterSuggestions, selectSuggestion, updateQuery]);

  return {
    isOpen: state.isOpen,
    query: state.query,
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    triggerRect: state.triggerRect,
    onSelect: selectSuggestion,
    onOpenChange: closeDropdown,
    onSelectedIndexChange: (index: number) => {
      setState((prev) => ({ ...prev, selectedIndex: index }));
    },
    getSuggestionHandler,
  };
};
