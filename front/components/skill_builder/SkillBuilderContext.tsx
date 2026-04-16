import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import { MCPServerViewsProvider } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { UserType, WorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type SkillBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
  /** Id of the current skill being edited, or null if the skill is not yet created. */
  skillId: string | null;
  /** Id of the currently selected suggestion, or null if none is selected. */
  selectedSuggestionId: string | null;
  setSelectedSuggestionId: (id: string | null) => void;
  /**
   * Accept instruction suggestion edits by calling the editor's acceptSuggestion
   * command directly (bypasses HTML roundtrip). Set by the editor component.
   */
  acceptInstructionEdits: ((suggestionSId: string) => void) | null;
  setAcceptInstructionEdits: (
    fn: ((suggestionSId: string) => void) | null
  ) => void;
};

export const SkillBuilderContext =
  createContext<SkillBuilderContextType | null>(null);

interface SkillBuilderProviderProps {
  owner: WorkspaceType;
  user: UserType;
  skillId: string | null;
  children: ReactNode;
}

export function SkillBuilderProvider({
  owner,
  user,
  skillId,
  children,
}: SkillBuilderProviderProps) {
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<
    string | null
  >(null);
  const [acceptInstructionEdits, setAcceptInstructionEdits] = useState<
    ((suggestionSId: string) => void) | null
  >(null);

  const value = useMemo(
    () => ({
      owner,
      user,
      skillId,
      selectedSuggestionId,
      setSelectedSuggestionId,
      acceptInstructionEdits,
      setAcceptInstructionEdits,
    }),
    [owner, user, skillId, selectedSuggestionId, acceptInstructionEdits]
  );

  return (
    <SkillBuilderContext.Provider value={value}>
      <SpacesProvider owner={owner}>
        <MCPServerViewsProvider owner={owner}>
          {children}
        </MCPServerViewsProvider>
      </SpacesProvider>
    </SkillBuilderContext.Provider>
  );
}

export function useSkillBuilderContext(): SkillBuilderContextType {
  const context = useContext(SkillBuilderContext);

  if (!context) {
    throw new Error(
      "useSkillBuilderContext must be used within a SkillBuilderProvider"
    );
  }

  return context;
}
