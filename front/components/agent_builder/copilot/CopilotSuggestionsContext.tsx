import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { getCommittedTextContent } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { useAgentSuggestions } from "@app/lib/swr/agent_suggestions";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";

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
  backendSuggestions: AgentSuggestionType[];
  getOrFetchSuggestion: (sId: string) => {
    notFoundAfterFetch: boolean;
    suggestion: AgentSuggestionType | null;
  };
  isSuggestionsLoading: boolean;
}

export const CopilotSuggestionsContext = createContext<
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

interface CopilotSuggestionsProviderProps {
  children: ReactNode;
  agentConfigurationId: string | null;
}

let suggestionIdCounter = 0;

// TODO(2026-01-26 Copilot): Use ID from the backend.
function generateSuggestionId(): string {
  suggestionIdCounter += 1;
  return `suggestion-${Date.now()}-${suggestionIdCounter}`;
}

export const CopilotSuggestionsProvider = ({
  children,
  agentConfigurationId,
}: CopilotSuggestionsProviderProps) => {
  const { owner } = useAgentBuilderContext();
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const appliedSuggestionsRef = useRef<Set<string>>(new Set());

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const hasCopilot = hasFeature("agent_builder_copilot");

  // Fetch all pending suggestions from the backend (all kinds).
  const {
    suggestions: backendSuggestions,
    isSuggestionsLoading,
    mutateSuggestions,
  } = useAgentSuggestions({
    agentConfigurationId,
    disabled: !hasCopilot,
    state: ["pending"],
    workspaceId: owner.sId,
  });

  const requestedSuggestionsRef = useRef<Set<string>>(new Set());
  const getOrFetchSuggestion = useCallback(
    (
      sId: string
    ): {
      notFoundAfterFetch: boolean;
      suggestion: AgentSuggestionType | null;
    } => {
      const suggestion = backendSuggestions.find((s) => s.sId === sId);
      if (suggestion) {
        return { notFoundAfterFetch: false, suggestion };
      }

      if (!requestedSuggestionsRef.current.has(sId)) {
        requestedSuggestionsRef.current.add(sId);
        // Defer to avoid setState during render (called from directive's useMemo).
        queueMicrotask(() => {
          void mutateSuggestions();
        });
        return { notFoundAfterFetch: false, suggestion: null };
      }

      return { notFoundAfterFetch: true, suggestion: null };
    },
    [backendSuggestions, mutateSuggestions]
  );

  const registerEditor = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Wait for the editor content to be set (happens in a RAF in the editor component).
    // Use a small delay to ensure content is fully loaded.
    const checkEditorReady = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (editor && !editor.isDestroyed) {
            setIsEditorReady(true);
          }
        });
      });
    };

    checkEditorReady();
  }, []);

  // Apply backend suggestions when editor is ready and suggestions are loaded.
  useEffect(() => {
    const editor = editorRef.current;

    if (
      !editor ||
      editor.isDestroyed ||
      !isEditorReady ||
      isSuggestionsLoading
    ) {
      return;
    }

    for (const backendSuggestion of backendSuggestions) {
      if (backendSuggestion.kind !== "instructions") {
        continue;
      }
      if (backendSuggestion.state !== "pending") {
        continue;
      }
      if (appliedSuggestionsRef.current.has(backendSuggestion.sId)) {
        continue;
      }

      const { oldString, newString } = backendSuggestion.suggestion;

      const applied = editor.commands.applySuggestion({
        id: backendSuggestion.sId,
        find: oldString,
        replacement: newString,
      });

      if (applied) {
        appliedSuggestionsRef.current.add(backendSuggestion.sId);
        setSuggestions((prev) => [
          ...prev,
          {
            id: backendSuggestion.sId,
            type: "instructions",
            find: oldString,
            replacement: newString,
            matchPositions: [],
          },
        ]);
      }
    }
  }, [backendSuggestions, isSuggestionsLoading, isEditorReady]);

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
      backendSuggestions,
      getOrFetchSuggestion,
      getCommittedInstructions,
      getPendingSuggestions,
      hasPendingSuggestions,
      isSuggestionsLoading,
      registerEditor,
      rejectAllSuggestions,
      rejectSuggestion,
    }),
    [
      suggestions,
      acceptAllSuggestions,
      acceptSuggestion,
      addSuggestion,
      backendSuggestions,
      getOrFetchSuggestion,
      getCommittedInstructions,
      getPendingSuggestions,
      hasPendingSuggestions,
      isSuggestionsLoading,
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
