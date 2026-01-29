import type { Editor } from "@tiptap/react";
import debounce from "lodash/debounce";
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
import {
  useAgentSuggestions,
  usePatchAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";

type CopilotSuggestionType = "instructions" | "tools" | "skills" | "model";

interface BaseCopilotSuggestion {
  id: string;
  type: CopilotSuggestionType;
}

export interface CopilotInstructionsSuggestion extends BaseCopilotSuggestion {
  type: "instructions";
  find: string;
  replacement: string;
  matchPositions: Array<{ start: number; end: number }>;
}

interface CopilotToolSuggestion extends BaseCopilotSuggestion {
  type: "tools";
  // other properties TBD
}

interface CopilotSkillSuggestion extends BaseCopilotSuggestion {
  type: "skills";
  // other properties TBD
}

interface CopilotModelSuggestion extends BaseCopilotSuggestion {
  type: "model";
  // other properties TBD
}

export type CopilotSuggestion =
  | CopilotInstructionsSuggestion
  | CopilotToolSuggestion
  | CopilotSkillSuggestion
  | CopilotModelSuggestion;

export interface AddSuggestionResult {
  success: boolean;
  error?: string;
  matchCount?: number;
}

export interface CopilotSuggestionsContextType {
  suggestions: CopilotSuggestion[];
  addSuggestion: (
    suggestion: Omit<CopilotInstructionsSuggestion, "id" | "matchPositions">,
    expectedCount?: number
  ) => AddSuggestionResult;
  acceptSuggestion: (id: string) => void;
  rejectSuggestion: (id: string) => void;
  acceptAllSuggestions: () => void;
  rejectAllSuggestions: () => void;
  registerEditor: (editor: Editor) => void;
  getPendingSuggestions: () => CopilotSuggestion[];
  getCommittedInstructions: () => string;
  backendSuggestions: AgentSuggestionType[];
  getSuggestion: (sId: string) => AgentSuggestionType | null;
  triggerRefetch: () => void;
  isSuggestionsLoading: boolean;
  isSuggestionsValidating: boolean;
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
    isSuggestionsValidating,
    mutateSuggestions,
  } = useAgentSuggestions({
    agentConfigurationId,
    disabled: !hasCopilot,
    state: ["pending"],
    workspaceId: owner.sId,
  });

  const getSuggestion = useCallback(
    (sId: string) => backendSuggestions.find((s) => s.sId === sId) ?? null,
    [backendSuggestions]
  );

  // Debounced refetch to batch multiple directive renders into one SWR call.
  const triggerRefetch = useMemo(
    () => debounce(() => void mutateSuggestions(), 100),
    [mutateSuggestions]
  );

  const { patchSuggestions } = usePatchAgentSuggestions({
    agentConfigurationId,
    workspaceId: owner.sId,
  });

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
      if (backendSuggestion.state !== "pending") {
        continue;
      }
      if (backendSuggestion.kind !== "instructions") {
        // We only need to apply the instructions suggestions in the editor.
        // Simply add the other kinds of pending suggestions to the context
        // to make them available for copilot agent.
        setSuggestions((prev) => [
          ...prev,
          {
            id: backendSuggestion.sId,
            type: backendSuggestion.kind,
          },
        ]);
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
      suggestion: Omit<CopilotInstructionsSuggestion, "id" | "matchPositions">,
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
      const newSuggestion: CopilotInstructionsSuggestion = {
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

  const acceptSuggestion = useCallback(
    async (id: string) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const result = await patchSuggestions([id], "approved");
      if (!result || !(result.suggestions.length > 0)) {
        return;
      }

      if (result.suggestions[0].kind === "instructions") {
        editor.commands.acceptSuggestion(id);
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    },
    [patchSuggestions]
  );

  const rejectSuggestion = useCallback(
    async (id: string) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const result = await patchSuggestions([id], "rejected");
      if (!result || !(result.suggestions.length > 0)) {
        return;
      }

      if (result.suggestions[0].kind === "instructions") {
        editor.commands.rejectSuggestion(id);
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    },
    [patchSuggestions]
  );

  /*
   * Batch operations are only on instructions suggestions
   */
  const acceptAllSuggestions = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const ids = suggestions
      .filter((s) => s.type === "instructions")
      .map((s) => s.id);
    const result = await patchSuggestions(ids, "approved");
    if (result) {
      editor.commands.acceptAllSuggestions();
      setSuggestions((prev) => prev.filter((s) => s.type === "instructions"));
    }
  }, [patchSuggestions, suggestions]);

  /*
   * Batch operations are only on instructions suggestions
   */
  const rejectAllSuggestions = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const ids = suggestions
      .filter((s) => s.type === "instructions")
      .map((s) => s.id);
    const result = await patchSuggestions(ids, "rejected");
    if (result) {
      editor.commands.rejectAllSuggestions();
      setSuggestions((prev) => prev.filter((s) => s.type === "instructions"));
    }
  }, [patchSuggestions, suggestions]);

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
      getSuggestion,
      triggerRefetch,
      getCommittedInstructions,
      getPendingSuggestions,
      isSuggestionsLoading,
      isSuggestionsValidating,
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
      getSuggestion,
      triggerRefetch,
      getCommittedInstructions,
      getPendingSuggestions,
      isSuggestionsLoading,
      isSuggestionsValidating,
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
