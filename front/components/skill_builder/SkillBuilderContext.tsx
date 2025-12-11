import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import { MCPServerViewsProvider } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { UserType, WorkspaceType } from "@app/types";

export type SkillBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
};

export const SkillBuilderContext =
  createContext<SkillBuilderContextType | null>(null);

interface SkillBuilderProviderProps {
  owner: WorkspaceType;
  user: UserType;
  children: ReactNode;
}

export function SkillBuilderProvider({
  owner,
  user,
  children,
}: SkillBuilderProviderProps) {
  return (
    <SkillBuilderContext.Provider value={{ owner, user }}>
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
