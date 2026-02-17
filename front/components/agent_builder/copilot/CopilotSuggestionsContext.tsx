import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useIsAgentBuilderCopilotEnabled } from "@app/components/agent_builder/hooks/useIsAgentBuilderCopilotEnabled";
import {
  BLUR_EVENT_NAME,
  INSTRUCTIONS_DEBOUNCE_MS,
} from "@app/components/agent_builder/instructions/constants";
import { getSuggestionPosition } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { stripHtmlAttributes } from "@app/components/editor/input_bar/cleanupPastedHTML";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import {
  useAgentSuggestions,
  usePatchAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  AgentInstructionsSuggestionType,
  AgentSuggestionType,
  AgentSuggestionWithRelationsType,
} from "@app/types/suggestions/agent_suggestion";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface CopilotSuggestionsContextType {
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
  getCommittedInstructionsHtml: () => string;

  // Actions on suggestions. Returns true on success, false on failure.
  acceptSuggestion: (sId: string) => Promise<boolean>;
  rejectSuggestion: (sId: string) => Promise<boolean>;
  acceptAllInstructionSuggestions: () => Promise<boolean>;
  rejectAllInstructionSuggestions: () => Promise<boolean>;

  focusOnSuggestion: (suggestionId: string) => void;

  highlightedSuggestionId: string | null;
  isHighlightedSuggestionPinned: boolean;
  highlightSuggestion: (id: string | null, pinned?: boolean) => void;
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
  const { mcpServerViews, mcpServerViewsWithKnowledge } =
    useMCPServerViewsContext();
  const { supportedDataSourceViews: dataSourceViews } =
    useDataSourceViewsContext();
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<
    string | null
  >(null);
  const [isHighlightedSuggestionPinned, setIsHighlightedSuggestionPinned] =
    useState(false);
  const editorRef = useRef<Editor | null>(null);
  const appliedSuggestionsRef = useRef<Set<string>>(new Set());
  const refetchAttemptedRef = useRef<Set<string>>(new Set());

  // Local state for processed (accepted/rejected/outdated) suggestions - prevents card "blink"
  const [processedSuggestions, setProcessedSuggestions] = useState<
    Map<string, AgentSuggestionType>
  >(new Map());

  const hasAttemptedRefetch = useCallback(
    (sId: string) => refetchAttemptedRef.current.has(sId),
    []
  );

  const hasCopilot = useIsAgentBuilderCopilotEnabled();

  const skillsMap = useMemo(
    () => new Map(skills.map((s) => [s.sId, s])),
    [skills]
  );

  const mcpServerViewsMap = useMemo(
    () => new Map(mcpServerViews.map((v) => [v.sId, v])),
    [mcpServerViews]
  );

  const dataSourceViewsMap = useMemo(
    () =>
      new Map(dataSourceViews.map((dsv: DataSourceViewType) => [dsv.sId, dsv])),
    [dataSourceViews]
  );

  const searchServerView = useMemo(
    () =>
      mcpServerViewsWithKnowledge.find((v) => v.server.name === "search") ??
      null,
    [mcpServerViewsWithKnowledge]
  );

  const {
    suggestions: pendingSuggestions,
    isSuggestionsLoading: isPendingLoading,
    isSuggestionsValidating: isPendingValidating,
    mutateSuggestions: mutatePending,
  } = useAgentSuggestions({
    agentConfigurationId,
    disabled: !hasCopilot,
    state: ["pending"],
    workspaceId: owner.sId,
  });

  const {
    suggestions: outdatedSuggestions,
    isSuggestionsLoading: isOutdatedLoading,
    mutateSuggestions: mutateOutdated,
  } = useAgentSuggestions({
    agentConfigurationId,
    disabled: !hasCopilot,
    state: ["outdated"],
    limit: 50,
    workspaceId: owner.sId,
  });

  const suggestions = useMemo(
    () => [...pendingSuggestions, ...outdatedSuggestions],
    [pendingSuggestions, outdatedSuggestions]
  );
  const isSuggestionsLoading = isPendingLoading || isOutdatedLoading;
  const isSuggestionsValidating = isPendingValidating;

  const mutateSuggestions = useCallback(async () => {
    await Promise.all([mutatePending(), mutateOutdated()]);
  }, [mutatePending, mutateOutdated]);

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
        case "tools":
        case "sub_agent": {
          const tool = mcpServerViewsMap.get(suggestion.suggestion.toolId);
          if (!tool) {
            return null;
          }

          return { ...suggestion, relations: { tool } };
        }

        case "skills": {
          const skill = skillsMap.get(suggestion.suggestion.skillId);
          if (!skill) {
            return null;
          }

          return { ...suggestion, relations: { skill } };
        }

        case "model": {
          const model = getModelConfigByModelId(suggestion.suggestion.modelId);
          if (!model) {
            return null;
          }

          return { ...suggestion, relations: { model } };
        }

        case "knowledge": {
          const dataSourceView = dataSourceViewsMap.get(
            suggestion.suggestion.dataSourceViewId
          );
          if (!dataSourceView || !searchServerView) {
            return null;
          }

          return {
            ...suggestion,
            relations: { dataSourceView, searchServerView },
          };
        }

        case "instructions":
          return { ...suggestion, relations: null };

        default:
          assertNever(suggestion);
      }
    },
    [
      getSuggestion,
      skillsMap,
      mcpServerViewsMap,
      dataSourceViewsMap,
      searchServerView,
    ]
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

  // Dispatch the blur event after a delay so the editor's debounced form sync
  // (250ms) completes first, ensuring the instructions field is up-to-date
  // when the description/avatar auto-generation reads it.
  const BLUR_DISPATCH_DELAY_MS = INSTRUCTIONS_DEBOUNCE_MS + 50;
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const dispatchDelayedBlur = useCallback(() => {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(BLUR_EVENT_NAME));
    }, BLUR_DISPATCH_DELAY_MS);
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

    // Get current pending instruction suggestion IDs.
    const currentPendingIds = new Set(
      suggestions
        .filter((s) => s.state === "pending" && s.kind === "instructions")
        .map((s) => s.sId)
    );

    // Remove marks for suggestions that were applied but are no longer pending.
    for (const appliedId of appliedSuggestionsRef.current) {
      if (!currentPendingIds.has(appliedId)) {
        editor.commands.rejectSuggestion(appliedId);
        appliedSuggestionsRef.current.delete(appliedId);
      }
    }

    const outdatedSuggestions: AgentInstructionsSuggestionType[] = [];

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

      const applied = editor.commands.applySuggestion({
        id: suggestion.sId,
        content: suggestion.suggestion.content,
        targetBlockId: suggestion.suggestion.targetBlockId,
      });

      if (applied) {
        appliedSuggestionsRef.current.add(suggestion.sId);
      } else {
        // If block not found, mark suggestion as outdated.
        outdatedSuggestions.push(suggestion);
      }
    }

    if (outdatedSuggestions.length > 0) {
      const outdatedSuggestionIds = outdatedSuggestions.map((s) => s.sId);

      void patchSuggestions(outdatedSuggestionIds, "outdated");

      setProcessedSuggestions((prev) =>
        outdatedSuggestions.reduce(
          (map, s) => map.set(s.sId, { ...s, state: "outdated" }),
          new Map(prev)
        )
      );
    }
  }, [suggestions, isSuggestionsLoading, isEditorReady, patchSuggestions]);

  useEffect(() => {
    if (isSuggestionsLoading) {
      return;
    }

    const serverOutdatedSuggestions = suggestions.filter(
      (s) => s.state === "outdated" && !processedSuggestions.has(s.sId)
    );

    if (serverOutdatedSuggestions.length > 0) {
      setProcessedSuggestions((prev) =>
        serverOutdatedSuggestions.reduce(
          (map, s) => map.set(s.sId, s),
          new Map(prev)
        )
      );
    }
  }, [suggestions, isSuggestionsLoading, processedSuggestions]);

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
        dispatchDelayedBlur();
      }

      return true;
    },
    [patchSuggestions, getSuggestion, dispatchDelayedBlur]
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

      dispatchDelayedBlur();

      return true;
    }, [patchSuggestions, getPendingSuggestions, dispatchDelayedBlur]);

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

  const getCommittedInstructionsHtml = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return "";
    }

    // Get HTML and strip styling attributes while preserving data-block-id.
    return stripHtmlAttributes(editor.getHTML());
  }, []);

  const highlightSuggestion = useCallback(
    (id: string | null, pinned = false) => {
      setHighlightedSuggestionId(id);
      setIsHighlightedSuggestionPinned(pinned);
    },
    []
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed) {
      editor.commands.setHighlightedSuggestion(highlightedSuggestionId);
    }
  }, [highlightedSuggestionId]);

  const focusOnSuggestion = useCallback(
    (suggestionId: string) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      const position = getSuggestionPosition(editor, suggestionId);
      if (position !== null) {
        editor
          .chain()
          .focus()
          .setTextSelection(position)
          .scrollIntoView()
          .run();

        highlightSuggestion(suggestionId, true);
      }
    },
    [highlightSuggestion]
  );

  const value: CopilotSuggestionsContextType = useMemo(
    () => ({
      acceptAllInstructionSuggestions,
      acceptSuggestion,
      focusOnSuggestion,
      getCommittedInstructionsHtml,
      getPendingSuggestions,
      getSuggestionWithRelations,
      hasAttemptedRefetch,
      highlightSuggestion,
      highlightedSuggestionId,
      isHighlightedSuggestionPinned,
      isSuggestionsLoading,
      isSuggestionsValidating,
      registerEditor,
      rejectAllInstructionSuggestions,
      rejectSuggestion,
      triggerRefetch,
    }),
    [
      acceptAllInstructionSuggestions,
      acceptSuggestion,
      focusOnSuggestion,
      getCommittedInstructionsHtml,
      getPendingSuggestions,
      getSuggestionWithRelations,
      hasAttemptedRefetch,
      highlightSuggestion,
      highlightedSuggestionId,
      isHighlightedSuggestionPinned,
      isSuggestionsLoading,
      isSuggestionsValidating,
      registerEditor,
      rejectAllInstructionSuggestions,
      rejectSuggestion,
      triggerRefetch,
    ]
  );

  return (
    <CopilotSuggestionsContext.Provider value={value}>
      {children}
    </CopilotSuggestionsContext.Provider>
  );
};

CopilotSuggestionsProvider.displayName = "CopilotSuggestionsProvider";
