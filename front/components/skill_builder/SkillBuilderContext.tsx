import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import { KnowledgeOwnerProvider } from "@app/components/editor/extensions/skill_builder/KnowledgeOwnerContext";
import { MCPServerViewsProvider } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { UserType, WorkspaceType } from "@app/types";

export type SkillBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
  /** Id of the current skill being edited, or null if the skill is not yet created. */
  skillId: string | null;
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
  return (
    <SkillBuilderContext.Provider value={{ owner, user, skillId }}>
      <KnowledgeOwnerProvider owner={owner}>
        <SpacesProvider owner={owner}>
          <MCPServerViewsProvider owner={owner}>
            {children}
          </MCPServerViewsProvider>
        </SpacesProvider>
      </KnowledgeOwnerProvider>
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
