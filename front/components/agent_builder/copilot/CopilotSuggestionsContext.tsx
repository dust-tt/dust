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
  suggestions: AgentSuggestionType[];
  getSuggestion: (sId: string) => AgentSuggestionWithRelationsType | null;
  triggerRefetch: () => void;
  isSuggestionsLoading: boolean;
  isSuggestionsValidating: boolean;

  // Editor registration for applying instruction suggestions.
  registerEditor: (editor: Editor) => void;
  getCommittedInstructions: () => string;

  // Actions on suggestions.
  acceptSuggestion: (sId: string) => void;
  rejectSuggestion: (sId: string) => void;
  acceptAllInstructionSuggestions: () => void;
  rejectAllInstructionSuggestions: () => void;
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
    state: ["pending", "approved", "rejected"],
    workspaceId: owner.sId,
  });

  // Resolve a suggestion with its relations from context.
  const getSuggestion = useCallback(
    (sId: string): AgentSuggestionWithRelationsType | null => {
      const suggestion = suggestions.find((s) => s.sId === sId);
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
    [suggestions, skillsMap, mcpServerViewsMap]
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
    async (sId: string) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const suggestion = suggestions.find((s) => s.sId === sId);
      if (!suggestion) {
        return;
      }

      const result = await patchSuggestions([sId], "approved");
      if (!result || result.suggestions.length === 0) {
        return;
      }

      if (suggestion.kind === "instructions") {
        editor.commands.acceptSuggestion(sId);
        appliedSuggestionsRef.current.delete(sId);
      }
    },
    [patchSuggestions, suggestions]
  );

  const rejectSuggestion = useCallback(
    async (sId: string) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const suggestion = suggestions.find((s) => s.sId === sId);
      if (!suggestion) {
        return;
      }

      const result = await patchSuggestions([sId], "rejected");
      if (!result || result.suggestions.length === 0) {
        return;
      }

      if (suggestion.kind === "instructions") {
        editor.commands.rejectSuggestion(sId);
        appliedSuggestionsRef.current.delete(sId);
      }
    },
    [patchSuggestions, suggestions]
  );

  const acceptAllInstructionSuggestions = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const instructionSuggestionIds = suggestions
      .filter((s) => s.kind === "instructions" && s.state === "pending")
      .map((s) => s.sId);

    if (instructionSuggestionIds.length === 0) {
      return;
    }

    const result = await patchSuggestions(instructionSuggestionIds, "approved");
    if (result) {
      editor.commands.acceptAllSuggestions();
      for (const sId of instructionSuggestionIds) {
        appliedSuggestionsRef.current.delete(sId);
      }
    }
  }, [patchSuggestions, suggestions]);

  const rejectAllInstructionSuggestions = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const instructionSuggestionIds = suggestions
      .filter((s) => s.kind === "instructions" && s.state === "pending")
      .map((s) => s.sId);

    if (instructionSuggestionIds.length === 0) {
      return;
    }

    const result = await patchSuggestions(instructionSuggestionIds, "rejected");
    if (result) {
      editor.commands.rejectAllSuggestions();
      for (const sId of instructionSuggestionIds) {
        appliedSuggestionsRef.current.delete(sId);
      }
    }
  }, [patchSuggestions, suggestions]);

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
      getSuggestion,
      triggerRefetch,
      isSuggestionsLoading,
      isSuggestionsValidating,
      registerEditor,
      getCommittedInstructions,
      acceptSuggestion,
      rejectSuggestion,
      acceptAllInstructionSuggestions,
      rejectAllInstructionSuggestions,
    }),
    [
      suggestions,
      getSuggestion,
      triggerRefetch,
      isSuggestionsLoading,
      isSuggestionsValidating,
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
