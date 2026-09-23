import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

const NO_SUGGESTIONS: never[] = [];

const SkillSuggestionPreviewContext =
  createContext<SkillSuggestionType[]>(NO_SUGGESTIONS);

interface SkillSuggestionPreviewProviderProps {
  suggestions: SkillSuggestionType[];
  children: ReactNode;
}

export function SkillSuggestionPreviewProvider({
  suggestions,
  children,
}: SkillSuggestionPreviewProviderProps) {
  return (
    <SkillSuggestionPreviewContext.Provider
      value={suggestions.length === 0 ? NO_SUGGESTIONS : suggestions}
    >
      {children}
    </SkillSuggestionPreviewContext.Provider>
  );
}

export function useSkillSuggestionPreview(): SkillSuggestionType[] {
  return useContext(SkillSuggestionPreviewContext);
}

const AgentSuggestionPreviewContext =
  createContext<AgentSuggestionType[]>(NO_SUGGESTIONS);

interface AgentSuggestionPreviewProviderProps {
  suggestions: AgentSuggestionType[];
  children: ReactNode;
}

export function AgentSuggestionPreviewProvider({
  suggestions,
  children,
}: AgentSuggestionPreviewProviderProps) {
  return (
    <AgentSuggestionPreviewContext.Provider
      value={suggestions.length === 0 ? NO_SUGGESTIONS : suggestions}
    >
      {children}
    </AgentSuggestionPreviewContext.Provider>
  );
}

export function useAgentSuggestionPreview(): AgentSuggestionType[] {
  return useContext(AgentSuggestionPreviewContext);
}
