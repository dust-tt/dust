import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ActionProgressState } from "@app/components/assistant/conversation/types";
import { isAgentSuggestionProgressOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";

interface AgentMessageSuggestionsContextType {
  addSuggestion: (suggestion: AgentSuggestionType) => void;
  getSuggestion: (sId: string) => AgentSuggestionType | undefined;
}

const AgentMessageSuggestionsContext = createContext<
  AgentMessageSuggestionsContextType | undefined
>(undefined);

export function useAgentMessageSuggestions() {
  const context = useContext(AgentMessageSuggestionsContext);
  if (!context) {
    throw new Error(
      "useAgentMessageSuggestions must be used within a AgentMessageSuggestionsProvider"
    );
  }
  return context;
}

interface AgentMessageSuggestionsProviderProps {
  children: React.ReactNode;
  actionProgress?: ActionProgressState;
}

/**
 * Extract suggestions from action progress notifications.
 */
function extractSuggestionsFromProgress(
  actionProgress: ActionProgressState
): Map<string, AgentSuggestionType> {
  const suggestions = new Map<string, AgentSuggestionType>();

  for (const [, progressData] of actionProgress) {
    const output = progressData.progress?.data?.output;
    if (isAgentSuggestionProgressOutput(output)) {
      suggestions.set(output.suggestion.sId, output.suggestion);
    }
  }

  return suggestions;
}

/**
 * Provider for copilot suggestions.
 *
 * TODO(copilot): Suggestions are lost on tab switch because actionProgress is not persisted.
 * When the conversation reloads, actionProgress is empty and directives render nothing.
 * Fix options:
 * 1. Fetch suggestions from backend by sId when not in context (cleanest)
 * 2. Move provider higher (CopilotPanelContext) but AgentMessage is used outside copilot too
 * 3. Store suggestions in message field like agentMessage.citations
 */
export function AgentMessageSuggestionsProvider({
  children,
  actionProgress,
}: AgentMessageSuggestionsProviderProps) {
  const [suggestions, setSuggestions] = useState<
    Map<string, AgentSuggestionType>
  >(new Map());

  // Extract suggestions from actionProgress when it changes.
  useEffect(() => {
    if (actionProgress) {
      const extracted = extractSuggestionsFromProgress(actionProgress);
      if (extracted.size > 0) {
        setSuggestions((prev) => {
          const next = new Map(prev);
          for (const [sId, data] of extracted) {
            next.set(sId, data);
          }
          return next;
        });
      }
    }
  }, [actionProgress]);

  const addSuggestion = useCallback((suggestion: AgentSuggestionType) => {
    setSuggestions((prev) => {
      const next = new Map(prev);
      next.set(suggestion.sId, suggestion);
      return next;
    });
  }, []);

  const getSuggestion = useCallback(
    (sId: string) => suggestions.get(sId),
    [suggestions]
  );

  const value = useMemo(
    () => ({ addSuggestion, getSuggestion }),
    [addSuggestion, getSuggestion]
  );

  return (
    <AgentMessageSuggestionsContext.Provider value={value}>
      {children}
    </AgentMessageSuggestionsContext.Provider>
  );
}
