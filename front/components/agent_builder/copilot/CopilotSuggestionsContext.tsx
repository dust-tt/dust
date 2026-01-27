import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { getCommittedTextContent } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";

export type CopilotSuggestionType = "instructions"; // Future: | "tool" | "skill".

export interface CopilotSuggestion {
  id: string;
  type: CopilotSuggestionType;
  // Instructions-specific payload
  find: string;
  replacement: string;
  matchPositions: Array<{ start: number; end: number }>;
}

export interface AddSuggestionResult {
  success: boolean;
  error?: string;
  matchCount?: number;
}

export interface CopilotSuggestionsContextType {
  suggestions: CopilotSuggestion[];
  addSuggestion: (
    suggestion: Omit<CopilotSuggestion, "id" | "matchPositions">,
    expectedCount?: number
  ) => AddSuggestionResult;
  acceptSuggestion: (id: string) => void;
  rejectSuggestion: (id: string) => void;
  acceptAllSuggestions: () => void;
  rejectAllSuggestions: () => void;
  registerEditor: (editor: Editor) => void;
  hasPendingSuggestions: () => boolean;
  getPendingSuggestions: () => CopilotSuggestion[];
  getCommittedInstructions: () => string;
}

const CopilotSuggestionsContext = createContext<
  CopilotSuggestionsContextType | undefined
>(undefined);

export const useCopilotSuggestions = () => {
  const context = useContext(CopilotSuggestionsContext);
  if (!context) {
    throw new Error(
      "useCopilotSuggestions must be used within a CopilotSuggestionsProvider"
    );
  }
  return context;
};

/**
 * Optional hook that returns the context or undefined if not in a provider.
 * Useful for components that may or may not be wrapped in the provider.
 */
export const useCopilotSuggestionsOptional = () => {
  return useContext(CopilotSuggestionsContext);
};

interface CopilotSuggestionsProviderProps {
  children: ReactNode;
}

let suggestionIdCounter = 0;

// TODO(2026-01-26 Copilot): Use ID from the backend.
function generateSuggestionId(): string {
  suggestionIdCounter += 1;
  return `suggestion-${Date.now()}-${suggestionIdCounter}`;
}

export const CopilotSuggestionsProvider = ({
  children,
}: CopilotSuggestionsProviderProps) => {
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const editorRef = useRef<Editor | null>(null);

  const registerEditor = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const addSuggestion = useCallback(
    (
      suggestion: Omit<CopilotSuggestion, "id" | "matchPositions">,
      expectedCount?: number
    ): AddSuggestionResult => {
      const editor = editorRef.current;
      if (!editor) {
        return { success: false, error: "Editor not registered" };
      }

      // Get the committed text (without existing suggestion marks).
      const committedText = getCommittedTextContent(editor);

      // Find all occurrences of the find text.
      const matchPositions: Array<{ start: number; end: number }> = [];
      let searchStart = 0;
      let index = committedText.indexOf(suggestion.find, searchStart);

      while (index !== -1) {
        matchPositions.push({
          start: index,
          end: index + suggestion.find.length,
        });
        searchStart = index + 1;
        index = committedText.indexOf(suggestion.find, searchStart);
      }

      if (matchPositions.length === 0) {
        return {
          success: false,
          error: `Could not find "${suggestion.find}" in the instructions.`,
          matchCount: 0,
        };
      }

      // Check expected count before applying.
      if (
        expectedCount !== undefined &&
        matchPositions.length !== expectedCount
      ) {
        return {
          success: false,
          error: `Expected ${expectedCount} match(es) but found ${matchPositions.length}. Please provide a more specific "find" text.`,
          matchCount: matchPositions.length,
        };
      }

      const id = generateSuggestionId();
      const newSuggestion: CopilotSuggestion = {
        ...suggestion,
        id,
        matchPositions,
      };

      // Apply the suggestion to the editor (creates marks).
      const applied = editor.commands.applySuggestion({
        id,
        find: suggestion.find,
        replacement: suggestion.replacement,
      });

      if (!applied) {
        return {
          success: false,
          error: "Failed to apply suggestion to editor.",
        };
      }

      setSuggestions((prev) => [...prev, newSuggestion]);

      return { success: true, matchCount: matchPositions.length };
    },
    []
  );

  const acceptSuggestion = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.commands.acceptSuggestion(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const rejectSuggestion = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.commands.rejectSuggestion(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const acceptAllSuggestions = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.commands.acceptAllSuggestions();
    setSuggestions([]);
  }, []);

  const rejectAllSuggestions = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.commands.rejectAllSuggestions();
    setSuggestions([]);
  }, []);

  const hasPendingSuggestions = useCallback(() => {
    return suggestions.length > 0;
  }, [suggestions]);

  const getPendingSuggestions = useCallback(() => {
    return suggestions;
  }, [suggestions]);

  const getCommittedInstructions = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return "";
    }
    return getCommittedTextContent(editor);
  }, []);

  const value: CopilotSuggestionsContextType = useMemo(
    () => ({
      suggestions,
      acceptAllSuggestions,
      acceptSuggestion,
      addSuggestion,
      getCommittedInstructions,
      getPendingSuggestions,
      hasPendingSuggestions,
      registerEditor,
      rejectAllSuggestions,
      rejectSuggestion,
    }),
    [
      suggestions,
      acceptAllSuggestions,
      acceptSuggestion,
      addSuggestion,
      getCommittedInstructions,
      getPendingSuggestions,
      hasPendingSuggestions,
      registerEditor,
      rejectAllSuggestions,
      rejectSuggestion,
    ]
  );

  return (
    <CopilotSuggestionsContext.Provider value={value}>
      {children}
    </CopilotSuggestionsContext.Provider>
  );
};

CopilotSuggestionsProvider.displayName = "CopilotSuggestionsProvider";
