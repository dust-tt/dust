import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

const NO_SUGGESTIONS: never[] = [];

interface SuggestionPreview<T> {
  suggestions: T[];
  isApplied: boolean;
}

const NO_PREVIEW: SuggestionPreview<never> = {
  suggestions: NO_SUGGESTIONS,
  isApplied: false,
};

const SkillSuggestionPreviewContext =
  createContext<SuggestionPreview<SkillSuggestionType>>(NO_PREVIEW);

interface SkillSuggestionPreviewProviderProps {
  suggestions: SkillSuggestionType[];
  isApplied: boolean;
  children: ReactNode;
}

export function SkillSuggestionPreviewProvider({
  suggestions,
  isApplied,
  children,
}: SkillSuggestionPreviewProviderProps) {
  const value = useMemo(
    () => (suggestions.length === 0 ? NO_PREVIEW : { suggestions, isApplied }),
    [suggestions, isApplied]
  );

  return (
    <SkillSuggestionPreviewContext.Provider value={value}>
      {children}
    </SkillSuggestionPreviewContext.Provider>
  );
}

export function useSkillSuggestionPreview(): SkillSuggestionType[] {
  const { suggestions, isApplied } = useContext(SkillSuggestionPreviewContext);
  return isApplied ? suggestions : NO_SUGGESTIONS;
}

export function useIsSkillSuggestionPreview(): boolean {
  return useContext(SkillSuggestionPreviewContext).suggestions.length > 0;
}

const AgentSuggestionPreviewContext =
  createContext<SuggestionPreview<AgentSuggestionType>>(NO_PREVIEW);

interface AgentSuggestionPreviewProviderProps {
  suggestions: AgentSuggestionType[];
  isApplied: boolean;
  children: ReactNode;
}

export function AgentSuggestionPreviewProvider({
  suggestions,
  isApplied,
  children,
}: AgentSuggestionPreviewProviderProps) {
  const value = useMemo(
    () => (suggestions.length === 0 ? NO_PREVIEW : { suggestions, isApplied }),
    [suggestions, isApplied]
  );

  return (
    <AgentSuggestionPreviewContext.Provider value={value}>
      {children}
    </AgentSuggestionPreviewContext.Provider>
  );
}

export function useAgentSuggestionPreview(): AgentSuggestionType[] {
  const { suggestions, isApplied } = useContext(AgentSuggestionPreviewContext);
  return isApplied ? suggestions : NO_SUGGESTIONS;
}

export function useIsAgentSuggestionPreview(): boolean {
  return useContext(AgentSuggestionPreviewContext).suggestions.length > 0;
}
