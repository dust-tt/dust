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
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getCommittedTextContent } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getModelConfigByModelId } from "@app/lib/api/models";
import {
  useAgentSuggestions,
  usePatchAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";

export interface CopilotSuggestionsContextType {
  // Backend suggestions fetched via SWR.
  suggestions: AgentSuggestionType[];
  getSuggestion: (sId: string) => AgentSuggestionType | null;
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
  const [isEditorReady, setIsEditorReady] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const appliedSuggestionsRef = useRef<Set<string>>(new Set());

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const hasCopilot = hasFeature("agent_builder_copilot");

  const { getValues, setValue } = useFormContext<AgentBuilderFormData>();
  const { skills: allSkills } = useSkillsContext();
  const { mcpServerViews } = useMCPServerViewsContext();

  const allSkillsMap = useMemo(
    () => new Map(allSkills.map((skill) => [skill.sId, skill])),
    [allSkills]
  );

  const mcpServerViewsMap = useMemo(
    () => new Map(mcpServerViews.map((view) => [view.sId, view])),
    [mcpServerViews]
  );

  // Fetch all suggestions from the backend.
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

  const getSuggestion = useCallback(
    (sId: string) => suggestions.find((s) => s.sId === sId) ?? null,
    [suggestions]
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
      if (!result) {
        return;
      }

      if (suggestion.kind === "instructions") {
        editor.commands.acceptSuggestion(sId);
        appliedSuggestionsRef.current.delete(sId);
      } else if (suggestion.kind === "skills") {
        const { additions, deletions } = suggestion.suggestion;
        const currentSkills = getValues("skills");

        if (additions && additions.length > 0) {
          const currentSkillIds = new Set(currentSkills.map((s) => s.sId));
          const skillsToAdd: AgentBuilderFormData["skills"] = [];

          for (const skillSId of additions) {
            if (currentSkillIds.has(skillSId)) {
              continue;
            }
            const skill = allSkillsMap.get(skillSId);
            if (skill) {
              skillsToAdd.push({
                sId: skill.sId,
                name: skill.name,
                description: skill.userFacingDescription,
                icon: skill.icon,
              });
            }
          }

          if (skillsToAdd.length > 0) {
            setValue("skills", [...currentSkills, ...skillsToAdd], {
              shouldDirty: true,
            });
          }
        }

        if (deletions && deletions.length > 0) {
          const updatedSkills = getValues("skills");
          const deletionSet = new Set(deletions);
          const filteredSkills = updatedSkills.filter(
            (s) => !deletionSet.has(s.sId)
          );
          if (filteredSkills.length !== updatedSkills.length) {
            setValue("skills", filteredSkills, { shouldDirty: true });
          }
        }
      } else if (suggestion.kind === "tools") {
        const { additions, deletions } = suggestion.suggestion;
        const currentActions = getValues("actions");

        if (additions && additions.length > 0) {
          const currentToolIds = new Set(
            currentActions.map((a) => a.configuration?.mcpServerViewId)
          );
          const actionsToAdd: AgentBuilderFormData["actions"] = [];

          for (const toolAddition of additions) {
            const mcpServerView = mcpServerViewsMap.get(toolAddition.id);
            if (!mcpServerView) {
              continue;
            }

            // Skip if already added
            if (currentToolIds.has(mcpServerView.sId)) {
              continue;
            }
            const action = getDefaultMCPAction(mcpServerView);
            actionsToAdd.push(action);
          }

          if (actionsToAdd.length > 0) {
            setValue("actions", [...currentActions, ...actionsToAdd], {
              shouldDirty: true,
            });
          }
        }

        if (deletions && deletions.length > 0) {
          const updatedActions = getValues("actions");
          const deletionSet = new Set(deletions);
          const filteredActions = updatedActions.filter(
            (a) => !deletionSet.has(a.configuration?.mcpServerViewId ?? "")
          );
          if (filteredActions.length !== updatedActions.length) {
            setValue("actions", filteredActions, { shouldDirty: true });
          }
        }
      } else if (suggestion.kind === "model") {
        const { modelId, reasoningEffort } = suggestion.suggestion;
        const modelConfig = getModelConfigByModelId(modelId);
        if (modelConfig) {
          const currentSettings = getValues("generationSettings");
          setValue(
            "generationSettings",
            {
              ...currentSettings,
              modelSettings: {
                modelId: modelConfig.modelId,
                providerId: modelConfig.providerId,
              },
              reasoningEffort:
                reasoningEffort ?? modelConfig.defaultReasoningEffort,
            },
            { shouldDirty: true }
          );
        }
      }
    },
    [
      patchSuggestions,
      suggestions,
      getValues,
      setValue,
      allSkillsMap,
      mcpServerViewsMap,
    ]
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
      if (!result) {
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
