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
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getModelConfigByModelId } from "@app/lib/api/models";
import {
  useAgentSuggestions,
  usePatchAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { removeNulls } from "@app/types";
import type {
  AgentSuggestionType,
  AgentSuggestionWithRelationsType,
} from "@app/types/suggestions/agent_suggestion";

export interface CopilotSuggestionsContextType {
  // Backend suggestions fetched via SWR.
  getSuggestionWithRelations: (
    sId: string
  ) => AgentSuggestionWithRelationsType | null;
  getPendingSuggestions: () => AgentSuggestionType[];
  triggerRefetch: (sId: string) => void;
  isSuggestionsLoading: boolean;
  isSuggestionsValidating: boolean;

  // Refetch tracking (persists across component remounts).
  hasAttemptedRefetch: (sId: string) => boolean;

  // Editor registration for applying instruction suggestions.
  registerEditor: (editor: Editor) => void;
  getCommittedInstructions: () => string;

  // Actions on suggestions. Returns true on success, false on failure.
  acceptSuggestion: (sId: string) => Promise<boolean>;
  rejectSuggestion: (sId: string) => Promise<boolean>;
  acceptAllInstructionSuggestions: () => Promise<boolean>;
  rejectAllInstructionSuggestions: () => Promise<boolean>;
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

export const CopilotSuggestionsProvider = ({
  children,
  agentConfigurationId,
}: CopilotSuggestionsProviderProps) => {
  const { owner } = useAgentBuilderContext();
  const { skills } = useSkillsContext();
  const { mcpServerViews } = useMCPServerViewsContext();
  const [isEditorReady, setIsEditorReady] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const appliedSuggestionsRef = useRef<Set<string>>(new Set());
  const refetchAttemptedRef = useRef<Set<string>>(new Set());

  // Local state for processed (accepted/rejected) suggestions - prevents card "blink"
  const [processedSuggestions, setProcessedSuggestions] = useState<
    Map<string, AgentSuggestionType>
  >(new Map());

  const hasAttemptedRefetch = useCallback(
    (sId: string) => refetchAttemptedRef.current.has(sId),
    []
  );

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const hasCopilot = hasFeature("agent_builder_copilot");

  const skillsMap = useMemo(
    () => new Map(skills.map((s) => [s.sId, s])),
    [skills]
  );

  const mcpServerViewsMap = useMemo(
    () => new Map(mcpServerViews.map((v) => [v.sId, v])),
    [mcpServerViews]
  );

  const {
    suggestions,
    isSuggestionsLoading,
    isSuggestionsValidating,
    mutateSuggestions,
  } = useAgentSuggestions({
    agentConfigurationId,
    disabled: !hasCopilot,
    state: ["pending"],
    workspaceId: owner.sId,
  });

  // Get suggestion: check local state first, then backend (n is small, .find is fine)
  const getSuggestion = useCallback(
    (sId: string) =>
      processedSuggestions.get(sId) ?? suggestions.find((s) => s.sId === sId),
    [processedSuggestions, suggestions]
  );

  // Get pending suggestions: backend suggestions not yet processed locally
  const getPendingSuggestions = useCallback(
    () => suggestions.filter((s) => !processedSuggestions.has(s.sId)),
    [suggestions, processedSuggestions]
  );

  // Resolve a suggestion with its relations from context.
  const getSuggestionWithRelations = useCallback(
    (sId: string): AgentSuggestionWithRelationsType | null => {
      const suggestion = getSuggestion(sId);
      if (!suggestion) {
        return null;
      }

      switch (suggestion.kind) {
        case "tools": {
          const additions = removeNulls(
            (suggestion.suggestion.additions ?? []).map((a) =>
              mcpServerViewsMap.get(a.id)
            )
          );
          const deletions = removeNulls(
            (suggestion.suggestion.deletions ?? []).map((id) =>
              mcpServerViewsMap.get(id)
            )
          );
          const expectedRelations =
            (suggestion.suggestion.additions?.length ?? 0) +
            (suggestion.suggestion.deletions?.length ?? 0);
          const resolvedRelations = additions.length + deletions.length;
          if (expectedRelations !== resolvedRelations) {
            return null;
          }

          return { ...suggestion, relations: { additions, deletions } };
        }

        case "skills": {
          const additions = removeNulls(
            (suggestion.suggestion.additions ?? []).map((id) =>
              skillsMap.get(id)
            )
          );
          const deletions = removeNulls(
            (suggestion.suggestion.deletions ?? []).map((id) =>
              skillsMap.get(id)
            )
          );
          const expectedRelations =
            (suggestion.suggestion.additions?.length ?? 0) +
            (suggestion.suggestion.deletions?.length ?? 0);
          const resolvedRelations = additions.length + deletions.length;
          if (expectedRelations !== resolvedRelations) {
            return null;
          }

          return { ...suggestion, relations: { additions, deletions } };
        }

        case "model": {
          const model = getModelConfigByModelId(suggestion.suggestion.modelId);
          if (!model) {
            return null;
          }

          return { ...suggestion, relations: { model } };
        }

        case "instructions":
          return { ...suggestion, relations: null };
      }
    },
    [getSuggestion, skillsMap, mcpServerViewsMap]
  );

  // Debounced refetch to batch multiple directive renders into one SWR call.
  // Marks sIds as attempted only AFTER the fetch completes to avoid error flash.
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const attemptedRefetchRef = useRef<Set<string>>(new Set());

  const triggerRefetch = useCallback(
    (sId: string) => {
      attemptedRefetchRef.current.add(sId);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        await mutateSuggestions();
        for (const id of attemptedRefetchRef.current) {
          refetchAttemptedRef.current.add(id);
        }
        attemptedRefetchRef.current.clear();
      }, 100);
    },
    [mutateSuggestions]
  );

  const { patchSuggestions } = usePatchAgentSuggestions({
    agentConfigurationId,
    workspaceId: owner.sId,
  });

  const registerEditor = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Wait for the editor content to be set.
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

  // Apply pending instruction suggestions to the editor when they arrive from backend.
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

    for (const suggestion of suggestions) {
      // Only apply pending instruction suggestions.
      if (
        suggestion.state !== "pending" ||
        suggestion.kind !== "instructions"
      ) {
        continue;
      }

      // Don't re-apply suggestions that are already in the editor.
      if (appliedSuggestionsRef.current.has(suggestion.sId)) {
        continue;
      }

      const { oldString, newString } = suggestion.suggestion;

      const applied = editor.commands.applySuggestion({
        id: suggestion.sId,
        find: oldString,
        replacement: newString,
      });

      if (applied) {
        appliedSuggestionsRef.current.add(suggestion.sId);
      }
    }
  }, [suggestions, isSuggestionsLoading, isEditorReady]);

  const acceptSuggestion = useCallback(
    async (sId: string): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const suggestion = getSuggestion(sId);
      if (!suggestion) {
        return false;
      }

      // Optimistic update for card state
      setProcessedSuggestions((prev) =>
        new Map(prev).set(sId, { ...suggestion, state: "approved" })
      );

      const result = await patchSuggestions([sId], "approved");
      if (!result || result.suggestions.length === 0) {
        setProcessedSuggestions((prev) => new Map(prev).set(sId, suggestion));
        return false;
      }

      // Update editor only on success
      if (suggestion.kind === "instructions") {
        editor.commands.acceptSuggestion(sId);
        appliedSuggestionsRef.current.delete(sId);
      }

      return true;
    },
    [patchSuggestions, getSuggestion]
  );

  const rejectSuggestion = useCallback(
    async (sId: string): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const suggestion = getSuggestion(sId);
      if (!suggestion) {
        return false;
      }

      // Optimistic update for card state
      setProcessedSuggestions((prev) =>
        new Map(prev).set(sId, { ...suggestion, state: "rejected" })
      );

      const result = await patchSuggestions([sId], "rejected");
      if (!result || result.suggestions.length === 0) {
        setProcessedSuggestions((prev) => new Map(prev).set(sId, suggestion));
        return false;
      }

      // Update editor only on success
      if (suggestion.kind === "instructions") {
        editor.commands.rejectSuggestion(sId);
        appliedSuggestionsRef.current.delete(sId);
      }

      return true;
    },
    [patchSuggestions, getSuggestion]
  );

  const acceptAllInstructionSuggestions =
    useCallback(async (): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const instructionSuggestions = getPendingSuggestions().filter(
        (s) => s.kind === "instructions"
      );

      if (instructionSuggestions.length === 0) {
        return true;
      }

      const instructionSuggestionIds = instructionSuggestions.map((s) => s.sId);
      const result = await patchSuggestions(
        instructionSuggestionIds,
        "approved"
      );
      if (!result) {
        return false;
      }

      setProcessedSuggestions((prev) =>
        instructionSuggestions.reduce(
          (map, s) => map.set(s.sId, { ...s, state: "approved" }),
          new Map(prev)
        )
      );

      editor.commands.acceptAllSuggestions();
      for (const sId of instructionSuggestionIds) {
        appliedSuggestionsRef.current.delete(sId);
      }

      return true;
    }, [patchSuggestions, getPendingSuggestions]);

  const rejectAllInstructionSuggestions =
    useCallback(async (): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const instructionSuggestions = getPendingSuggestions().filter(
        (s) => s.kind === "instructions"
      );

      if (instructionSuggestions.length === 0) {
        return true;
      }

      const instructionSuggestionIds = instructionSuggestions.map((s) => s.sId);
      const result = await patchSuggestions(
        instructionSuggestionIds,
        "rejected"
      );
      if (!result) {
        return false;
      }

      setProcessedSuggestions((prev) =>
        instructionSuggestions.reduce(
          (map, s) => map.set(s.sId, { ...s, state: "rejected" }),
          new Map(prev)
        )
      );

      editor.commands.rejectAllSuggestions();
      for (const sId of instructionSuggestionIds) {
        appliedSuggestionsRef.current.delete(sId);
      }

      return true;
    }, [patchSuggestions, getPendingSuggestions]);

  const getCommittedInstructions = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return "";
    }
    return getCommittedTextContent(editor);
  }, []);

  const value: CopilotSuggestionsContextType = useMemo(
    () => ({
      getSuggestionWithRelations,
      getPendingSuggestions,
      triggerRefetch,
      isSuggestionsLoading,
      isSuggestionsValidating,
      hasAttemptedRefetch,
      registerEditor,
      getCommittedInstructions,
      acceptSuggestion,
      rejectSuggestion,
      acceptAllInstructionSuggestions,
      rejectAllInstructionSuggestions,
    }),
    [
      getSuggestionWithRelations,
      getPendingSuggestions,
      triggerRefetch,
      isSuggestionsLoading,
      isSuggestionsValidating,
      hasAttemptedRefetch,
      registerEditor,
      getCommittedInstructions,
      acceptSuggestion,
      rejectSuggestion,
      acceptAllInstructionSuggestions,
      rejectAllInstructionSuggestions,
    ]
  );

  return (
    <CopilotSuggestionsContext.Provider value={value}>
      {children}
    </CopilotSuggestionsContext.Provider>
  );
};

CopilotSuggestionsProvider.displayName = "CopilotSuggestionsProvider";
