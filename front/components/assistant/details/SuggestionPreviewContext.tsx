import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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

export type SkillDetailsSection =
  | "name"
  | "availability"
  | "description"
  | "when_to_use"
  | "guidelines"
  | "editors";

export function getEditedSkillSections(
  suggestions: SkillSuggestionType[]
): Set<SkillDetailsSection> {
  const sections = new Set<SkillDetailsSection>();
  for (const suggestion of suggestions) {
    switch (suggestion.kind) {
      case "user_facing_description":
        sections.add("description");
        break;
      case "editors":
      case "name":
      case "availability":
        sections.add(suggestion.kind);
        break;
      case "edit":
        if (suggestion.suggestion.instructionEdits?.length) {
          sections.add("guidelines");
        }
        if (suggestion.suggestion.agentFacingDescriptionEdit) {
          sections.add("when_to_use");
        }
        break;
      case "create":
      case "delete":
        break;
      default:
        assertNeverAndIgnore(suggestion);
    }
  }
  return sections;
}

export function useEditedSkillSections(): Set<SkillDetailsSection> {
  const suggestions = useSkillSuggestionPreview();
  return useMemo(() => getEditedSkillSections(suggestions), [suggestions]);
}

export type AgentDetailsSection =
  | "name"
  | "scope"
  | "description"
  | "instructions"
  | "skills"
  | "tools"
  | "knowledge"
  | "model";

export function getEditedAgentSections(
  suggestions: AgentSuggestionType[]
): Set<AgentDetailsSection> {
  const sections = new Set<AgentDetailsSection>();
  for (const suggestion of suggestions) {
    switch (suggestion.kind) {
      case "name":
      case "scope":
      case "description":
      case "instructions":
      case "skills":
      case "tools":
      case "knowledge":
      case "model":
        sections.add(suggestion.kind);
        break;
      case "sub_agent":
        sections.add("tools");
        break;
      case "create":
      case "delete":
        break;
      default:
        assertNeverAndIgnore(suggestion);
    }
  }
  return sections;
}

export function useEditedAgentSections(): Set<AgentDetailsSection> {
  const suggestions = useAgentSuggestionPreview();
  return useMemo(() => getEditedAgentSections(suggestions), [suggestions]);
}
