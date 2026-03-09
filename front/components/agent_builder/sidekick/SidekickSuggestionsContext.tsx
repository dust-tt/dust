import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useIsAgentBuilderCopilotEnabled } from "@app/components/agent_builder/hooks/useIsAgentBuilderSidekickEnabled";
import {
  BLUR_EVENT_NAME,
  INSTRUCTIONS_DEBOUNCE_MS,
} from "@app/components/agent_builder/instructions/constants";
import {
  CopilotHighlightProvider,
  useCopilotHighlight,
} from "@app/components/agent_builder/sidekick/SidekickHighlightContext";
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
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  AgentInstructionsSuggestionType,
  AgentSuggestionType,
  AgentSuggestionWithRelationsType,
} from "@app/types/suggestions/agent_suggestion";
import type { Editor } from "@tiptap/react";
import type { ReactNode, RefObject } from "react";
import {
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
  pendingSuggestions: AgentSuggestionType[];
  triggerRefetch: (sId: string) => void;
  isSuggestionsLoading: boolean;
  isSuggestionsValidating: boolean;

  // Refetch tracking (persists across component remounts).
  hasAttemptedRefetch: (sId: string) => boolean;

  // Editor registration for applying instruction suggestions.
  registerEditor: (editor: Editor) => void;
  getCommittedInstructionsHtml: () => string;

  // Actions on suggestions. Returns true on success, false on failure.
  acceptSuggestion: (suggestion: AgentSuggestionType) => Promise<boolean>;
  rejectSuggestion: (suggestion: AgentSuggestionType) => Promise<boolean>;
  acceptAllInstructionSuggestions: () => Promise<boolean>;
  rejectAllInstructionSuggestions: () => Promise<boolean>;

  focusOnSuggestion: (suggestion: AgentInstructionsSuggestionType) => void;

  // Scroll both panels to bring the next pending suggestion into view after accept.
  scrollToNextSuggestion: (acceptedSuggestion?: AgentSuggestionType) => void;
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

interface EditorHighlightSyncProps {
  editorRef: RefObject<Editor | null>;
}

// Pushes React highlight state into the editor so decorations stay in sync
function EditorHighlightSync({ editorRef }: EditorHighlightSyncProps) {
  const { highlightedSuggestionId } = useCopilotHighlight();
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed) {
      editor.commands.setHighlightedSuggestion(highlightedSuggestionId);
    }
  }, [highlightedSuggestionId, editorRef]);
  return null;
}

interface CopilotSuggestionsProviderProps {
  children: ReactNode;
  agentConfigurationId: string | null;
}

export const CopilotSuggestionsProvider = ({
  children,
  agentConfigurationId,
}: CopilotSuggestionsProviderProps) => {
  return (
    <CopilotHighlightProvider>
      <CopilotSuggestionsProviderContent
        agentConfigurationId={agentConfigurationId}
      >
        {children}
      </CopilotSuggestionsProviderContent>
    </CopilotHighlightProvider>
  );
};

function CopilotSuggestionsProviderContent({
  children,
  agentConfigurationId,
}: CopilotSuggestionsProviderProps) {
  const { owner } = useAgentBuilderContext();
  const { skills } = useSkillsContext();
  const { mcpServerViews, mcpServerViewsWithKnowledge } =
    useMCPServerViewsContext();
  const { supportedDataSourceViews: dataSourceViews } =
    useDataSourceViewsContext();
  const { highlightSuggestion } = useCopilotHighlight();
  const [isEditorReady, setIsEditorReady] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const appliedSuggestionsRef = useRef<Set<string>>(new Set());
  const refetchAttemptedRef = useRef<Set<string>>(new Set());
  const prevSuggestionCountRef = useRef(0);

  // We need to keep track of the suggestions that have been processed locally (accepted/rejected/outdated),
  // and put in ref to prevent re-render cascades.
  const processedSuggestionsRef = useRef<Map<string, AgentSuggestionType>>(
    new Map()
  );

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

  // Resolve a suggestion with its relations from context.
  const getSuggestionWithRelations = useCallback(
    (sId: string): AgentSuggestionWithRelationsType | null => {
      const suggestion =
        processedSuggestionsRef.current.get(sId) ??
        suggestions.find((s) => s.sId === sId);

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
          assertNeverAndIgnore(suggestion);
          return null;
      }
    },
    [
      suggestions,
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
    if (editorRef.current !== editor) {
      appliedSuggestionsRef.current.clear();
    }

    // Called after the editor has fully set its initial content, so it's
    // immediately ready to have suggestions applied.
    editorRef.current = editor;
    setIsEditorReady(true);
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

    // Pending = from SWR cache with state pending, excluding those already processed.
    const currentPendingIds = new Set(
      suggestions
        .filter((s) => s.state === "pending" && s.kind === "instructions")
        .filter((s) => {
          const processed = processedSuggestionsRef.current.get(s.sId);
          return !processed || processed.state === "pending";
        })
        .map((s) => s.sId)
    );

    // Remove marks for suggestions that were applied but are no longer pending.
    // Skip IDs we've marked approved (optimistic or confirmed) so we don't reject during accept.
    for (const appliedId of appliedSuggestionsRef.current) {
      const processed = processedSuggestionsRef.current.get(appliedId);
      if (
        !currentPendingIds.has(appliedId) &&
        processed?.state !== "approved"
      ) {
        editor.commands.rejectSuggestion(appliedId);
        appliedSuggestionsRef.current.delete(appliedId);
      }
    }

    const outdatedSuggestions: AgentInstructionsSuggestionType[] = [];

    for (const suggestion of suggestions) {
      // Only apply pending instruction suggestions.
      if (
        !currentPendingIds.has(suggestion.sId) ||
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

      for (const s of outdatedSuggestions) {
        processedSuggestionsRef.current.set(s.sId, { ...s, state: "outdated" });
      }

      // SWR optimistic update — remove from pending cache.
      void mutatePending(
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            suggestions: current.suggestions.filter(
              (s) => !outdatedSuggestionIds.includes(s.sId)
            ),
          };
        },
        { revalidate: false }
      );

      void patchSuggestions(outdatedSuggestionIds, "outdated");
    }
  }, [
    suggestions,
    isSuggestionsLoading,
    isEditorReady,
    patchSuggestions,
    mutatePending,
  ]);

  const scrollCopilotToSuggestion = useCallback((sId: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-suggestion-s-id="${sId}"]`
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const focusOnSuggestion = useCallback(
    (suggestion: AgentInstructionsSuggestionType) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      // Find the suggestion element in the DOM and scroll to it
      const suggestionElement = editor.view.dom.querySelector(
        `[data-suggestion-id="${suggestion.sId}"]`
      );

      if (suggestionElement) {
        suggestionElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        highlightSuggestion(suggestion.sId);
      }
    },
    [highlightSuggestion]
  );

  const scrollToNextSuggestion = useCallback(
    (acceptedSuggestion?: AgentSuggestionType) => {
      const editor = editorRef.current;
      const pendingInstructions = pendingSuggestions.filter(
        (s): s is AgentInstructionsSuggestionType =>
          s.kind === "instructions" && s.sId !== acceptedSuggestion?.sId
      );
      if (pendingInstructions.length === 0) {
        return;
      }

      // Order by document position (top to bottom in the instruction form)
      const sorted =
        editor && !editor.isDestroyed
          ? [...pendingInstructions].sort((a, b) => {
              const posA = getSuggestionPosition(editor, a.sId);
              const posB = getSuggestionPosition(editor, b.sId);
              if (posA === null) {
                return 1;
              }
              if (posB === null) {
                return -1;
              }
              return posA - posB;
            })
          : pendingInstructions;

      const next = sorted[0];
      focusOnSuggestion(next);
      scrollCopilotToSuggestion(next.sId);
    },
    [pendingSuggestions, focusOnSuggestion, scrollCopilotToSuggestion]
  );

  const acceptSuggestion = useCallback(
    async (suggestion: AgentSuggestionType): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const { sId } = suggestion;

      processedSuggestionsRef.current.set(sId, {
        ...suggestion,
        state: "approved",
      });

      // Optimistic update: remove from the pending SWR cache so it's no longer
      // counted as pending. The card stays visible via processedSuggestionsRef
      // with its new state (approved/rejected).
      // `revalidate: false` — don't refetch yet, the API call below will
      // confirm or rollback.
      void mutatePending(
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            suggestions: current.suggestions.filter((s) => s.sId !== sId),
          };
        },
        { revalidate: false }
      );

      // Send the state change to the server.
      const result = await patchSuggestions([sId], "approved");
      if (!result || result.suggestions.length === 0) {
        // API failed — undo the optimistic update: restore the suggestion in
        // the pending cache and clear the ref entry.
        processedSuggestionsRef.current.delete(sId);
        void mutatePending(
          (current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              suggestions: [...current.suggestions, suggestion],
            };
          },
          { revalidate: true }
        );
        return false;
      }

      if (suggestion.kind === "instructions") {
        editor.commands.acceptSuggestion(sId);
        appliedSuggestionsRef.current.delete(sId);
        dispatchDelayedBlur();
        scrollToNextSuggestion(suggestion);
      }

      return true;
    },
    [
      patchSuggestions,
      mutatePending,
      dispatchDelayedBlur,
      scrollToNextSuggestion,
    ]
  );

  const rejectSuggestion = useCallback(
    async (suggestion: AgentSuggestionType): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const { sId } = suggestion;

      // Optimistic update: mark as rejected in processedSuggestionsRef (so the
      // card shows the rejected state) and remove from the pending SWR cache.
      processedSuggestionsRef.current.set(sId, {
        ...suggestion,
        state: "rejected",
      });

      void mutatePending(
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            suggestions: current.suggestions.filter((s) => s.sId !== sId),
          };
        },
        { revalidate: false } // Don't refetch yet, the API call below will confirm or rollback.
      );

      // Send the state change to the server.
      const result = await patchSuggestions([sId], "rejected");
      if (!result || result.suggestions.length === 0) {
        // API failed — undo the optimistic update: restore the suggestion in
        // the pending cache and clear the ref entry.
        processedSuggestionsRef.current.delete(sId);
        void mutatePending(
          (current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              suggestions: [...current.suggestions, suggestion],
            };
          },
          { revalidate: true }
        );
        return false;
      }

      // Update editor only on success
      if (suggestion.kind === "instructions") {
        editor.commands.rejectSuggestion(sId);
        appliedSuggestionsRef.current.delete(sId);
      }

      return true;
    },
    [patchSuggestions, mutatePending]
  );

  const acceptAllInstructionSuggestions =
    useCallback(async (): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const instructionSuggestions = suggestions.filter(
        (s) => s.kind === "instructions" && s.state === "pending"
      );

      if (instructionSuggestions.length === 0) {
        return true;
      }

      const instructionSuggestionIds = instructionSuggestions.map((s) => s.sId);

      for (const s of instructionSuggestions) {
        processedSuggestionsRef.current.set(s.sId, {
          ...s,
          state: "approved",
        });
      }

      // Optimistic update: remove from the pending SWR cache so they're no
      // longer counted as pending. Cards stay visible via processedSuggestionsRef.
      void mutatePending(
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            suggestions: current.suggestions.filter(
              (s) => !instructionSuggestionIds.includes(s.sId)
            ),
          };
        },
        { revalidate: false } // Don't refetch yet, the API call below will confirm or rollback.
      );

      const result = await patchSuggestions(
        instructionSuggestionIds,
        "approved"
      );
      if (!result) {
        // API failed — undo the optimistic update: restore the suggestions in
        // the pending cache and clear the ref entries.
        for (const sId of instructionSuggestionIds) {
          processedSuggestionsRef.current.delete(sId);
        }
        void mutatePending(
          (current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              suggestions: [...current.suggestions, ...instructionSuggestions],
            };
          },
          { revalidate: true }
        );
        return false;
      }

      editor.commands.acceptAllSuggestions();
      for (const sId of instructionSuggestionIds) {
        appliedSuggestionsRef.current.delete(sId);
      }

      highlightSuggestion(null);
      dispatchDelayedBlur();

      return true;
    }, [
      suggestions,
      patchSuggestions,
      mutatePending,
      dispatchDelayedBlur,
      highlightSuggestion,
    ]);

  const rejectAllInstructionSuggestions =
    useCallback(async (): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) {
        return false;
      }

      const instructionSuggestions = suggestions.filter(
        (s) => s.kind === "instructions" && s.state === "pending"
      );

      if (instructionSuggestions.length === 0) {
        return true;
      }

      const instructionSuggestionIds = instructionSuggestions.map((s) => s.sId);

      for (const s of instructionSuggestions) {
        // Mark as rejected so cards show the rejected state via processedSuggestionsRef.
        processedSuggestionsRef.current.set(s.sId, {
          ...s,
          state: "rejected",
        });
      }

      // Remove from the pending SWR cache so they're no longer counted as pending.
      void mutatePending(
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            suggestions: current.suggestions.filter(
              (s) => !instructionSuggestionIds.includes(s.sId)
            ),
          };
        },
        { revalidate: false } // Don't refetch yet, the API call below will confirm or rollback.
      );

      const result = await patchSuggestions(
        instructionSuggestionIds,
        "rejected"
      );
      if (!result) {
        // API failed — undo the optimistic update: restore the suggestions in
        // the pending cache and clear the ref entries.
        for (const sId of instructionSuggestionIds) {
          processedSuggestionsRef.current.delete(sId);
        }
        void mutatePending(
          (current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              suggestions: [...current.suggestions, ...instructionSuggestions],
            };
          },
          { revalidate: true }
        );
        return false;
      }

      editor.commands.rejectAllSuggestions();
      for (const sId of instructionSuggestionIds) {
        appliedSuggestionsRef.current.delete(sId);
      }

      highlightSuggestion(null);

      return true;
    }, [suggestions, patchSuggestions, mutatePending, highlightSuggestion]);

  const getCommittedInstructionsHtml = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return "";
    }

    // Get HTML and strip styling attributes while preserving data-block-id.
    return stripHtmlAttributes(editor.getHTML());
  }, []);

  // Auto-scroll to the first suggestion when new suggestions are applied
  useEffect(() => {
    const pendingInstructions = suggestions.filter(
      (s) =>
        s.state === "pending" &&
        s.kind === "instructions" &&
        appliedSuggestionsRef.current.has(s.sId)
    );

    const currentCount = pendingInstructions.length;
    const prevCount = prevSuggestionCountRef.current;

    // Only auto-scroll when we transition from 0 to >0 suggestions (new batch arrived)
    if (prevCount === 0 && currentCount > 0) {
      scrollToNextSuggestion();
    }
    prevSuggestionCountRef.current = currentCount;
  }, [scrollToNextSuggestion, suggestions]);

  const value: CopilotSuggestionsContextType = useMemo(
    () => ({
      acceptAllInstructionSuggestions,
      acceptSuggestion,
      focusOnSuggestion,
      getCommittedInstructionsHtml,
      pendingSuggestions,
      getSuggestionWithRelations,
      hasAttemptedRefetch,
      isSuggestionsLoading,
      isSuggestionsValidating,
      registerEditor,
      rejectAllInstructionSuggestions,
      rejectSuggestion,
      scrollToNextSuggestion,
      triggerRefetch,
    }),
    [
      acceptAllInstructionSuggestions,
      acceptSuggestion,
      focusOnSuggestion,
      getCommittedInstructionsHtml,
      pendingSuggestions,
      getSuggestionWithRelations,
      hasAttemptedRefetch,
      isSuggestionsLoading,
      isSuggestionsValidating,
      registerEditor,
      rejectAllInstructionSuggestions,
      rejectSuggestion,
      scrollToNextSuggestion,
      triggerRefetch,
    ]
  );

  return (
    <CopilotSuggestionsContext.Provider value={value}>
      <EditorHighlightSync editorRef={editorRef} />
      {children}
    </CopilotSuggestionsContext.Provider>
  );
}

CopilotSuggestionsProvider.displayName = "CopilotSuggestionsProvider";
