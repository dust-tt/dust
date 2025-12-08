import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { UserType, WorkspaceType } from "@app/types";

type SkillBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
};

const SkillBuilderContext = createContext<SkillBuilderContextType | null>(null);

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
      {children}
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
