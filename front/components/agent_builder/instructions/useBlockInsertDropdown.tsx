import {
  CommandLineIcon,
  DocumentIcon,
  DocumentTextIcon,
} from "@dust-tt/sparkle";
import type { Editor as CoreEditor } from "@tiptap/core";
import type { Editor as ReactEditor } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import { useCallback, useMemo, useRef, useState } from "react";

type CompatibleEditor = CoreEditor | ReactEditor;

function isSelectionInInstructionBlock(
  editor: ReactEditor | CoreEditor | null
) {
  if (!editor || ("isDestroyed" in editor && editor.isDestroyed)) {
    return false;
  }
  const $from = (editor as ReactEditor).state.selection.$from;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === "instructionBlock") {
      return true;
    }
  }
  return false;
}

export interface BlockSuggestion {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  command: (
    editor: CompatibleEditor,
    range: { from: number; to: number }
  ) => void;
}

const BLOCK_SUGGESTIONS: BlockSuggestion[] = [
  {
    id: "heading",
    label: "Heading",
    icon: DocumentTextIcon,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
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

export type BlockInsertDropdownView = Pick<
  BlockInsertDropdownState,
  "isOpen" | "suggestions" | "selectedIndex" | "triggerRect"
>;

export const useBlockInsertDropdown = (
  editorRef: React.MutableRefObject<ReactEditor | null>
) => {
  const [state, setState] = useState<BlockInsertDropdownState>({
    isOpen: false,
    query: "",
    suggestions: BLOCK_SUGGESTIONS,
    selectedIndex: 0,
    triggerRect: null,
  });

  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  const currentStateRef = useRef(state);
  currentStateRef.current = state;

  const filterSuggestions = useCallback(
    (query: string, isInInstructionBlock: boolean) => {
      let suggestions = BLOCK_SUGGESTIONS;

      // Filter out XML block suggestion if we're already inside an instruction block
      if (isInInstructionBlock) {
        suggestions = BLOCK_SUGGESTIONS.filter(
          (item) => item.id !== "xml-block"
        );
      }

      if (!query) {
        return suggestions;
      }

      const lowerQuery = query.toLowerCase();
      return suggestions.filter((item) =>
        item.label.toLowerCase().includes(lowerQuery)
      );
    },
    []
  );

  const updateQuery = useCallback(
    (query: string, isInInstructionBlock: boolean) => {
      const filtered = filterSuggestions(query, isInInstructionBlock);
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

      if (editor && !editor.isDestroyed && rangeRef.current) {
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

  const suggestionOptions: Omit<
    SuggestionOptions<unknown, unknown>,
    "editor"
  > = useMemo(() => {
    return {
      char: "/",
      allow: ({ state, range }) => {
        if (!state.selection.empty) {
          return false;
        }

        const $from = state.doc.resolve(range.from);

        if ($from.parent.type.name === "codeBlock") {
          return false;
        }

        return true;
      },
      command: ({ editor, range, props }) => {
        const suggestion = props as Partial<BlockSuggestion>;
        if (
          !editor ||
          !range ||
          !suggestion ||
          typeof suggestion.command !== "function"
        ) {
          return;
        }
        suggestion.command(
          editor as CompatibleEditor,
          range as { from: number; to: number }
        );
      },
      items: ({ query }: { query: string }) => {
        const isInInstructionBlock = isSelectionInInstructionBlock(
          editorRef.current
        );
        return filterSuggestions(query, isInInstructionBlock);
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

            updateQuery(
              props.query || "",
              isSelectionInInstructionBlock(editorRef.current)
            );
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
              updateQuery(
                props.query || "",
                isSelectionInInstructionBlock(editorRef.current)
              );
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
                // If there are no suggestions, let the editor handle it.
                if (currentState.suggestions.length === 0) {
                  return false;
                }
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
                // If there are no suggestions, let the editor handle it.
                if (currentState.suggestions.length === 0) {
                  return false;
                }
                event.preventDefault();
                setState((prev) => ({
                  ...prev,
                  selectedIndex:
                    prev.selectedIndex < prev.suggestions.length - 1
                      ? prev.selectedIndex + 1
                      : 0,
                }));
                return true;
              case "Enter": {
                // If there are no suggestions, allow normal Enter behavior.
                if (currentState.suggestions.length === 0) {
                  return false;
                }
                event.preventDefault();
                if (currentState.suggestions[currentState.selectedIndex]) {
                  selectSuggestion(
                    currentState.suggestions[currentState.selectedIndex]
                  );
                }
                return true;
              }
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
                // Let the suggestion plugin handle the escape to properly exit
                return false;
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
  }, [
    closeDropdown,
    filterSuggestions,
    selectSuggestion,
    updateQuery,
    editorRef,
  ]);

  return {
    isOpen: state.isOpen,
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    triggerRect: state.triggerRect,
    onSelect: selectSuggestion,
    onOpenChange: (open: boolean) => {
      if (!open) {
        closeDropdown();
        // When dropdown is closed externally, we need to cancel the suggestion
        // This is handled by the Escape key press simulation or natural exit
      }
    },
    onSelectedIndexChange: (index: number) => {
      setState((prev) => ({ ...prev, selectedIndex: index }));
    },
    suggestionOptions,
  };
};
