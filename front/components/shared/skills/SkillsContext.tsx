import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

import { useSkillConfigurations } from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

interface SkillsContextType {
  skills: SkillConfigurationType[];
  isSkillsLoading: boolean;
  isSkillsError: boolean;
}

const SkillsContext = createContext<SkillsContextType | undefined>(undefined);

export const useSkillsContext = () => {
  const context = useContext(SkillsContext);
  if (!context) {
    throw new Error("useSkillsContext must be used within a SkillsProvider");
  }
  return context;
};

interface SkillsProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export const SkillsProvider = ({ owner, children }: SkillsProviderProps) => {
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const hasSkillsFeature = hasFeature("skills");

  const {
    skillConfigurations,
    isSkillConfigurationsLoading,
    isSkillConfigurationsError,
  } = useSkillConfigurations({
    owner,
    disabled: !hasSkillsFeature,
  });

  const value: SkillsContextType = useMemo(() => {
    return {
      skills: skillConfigurations,
      isSkillsLoading: isSkillConfigurationsLoading,
      isSkillsError: isSkillConfigurationsError,
    };
  }, [
    skillConfigurations,
    isSkillConfigurationsLoading,
    isSkillConfigurationsError,
  ]);

  return (
    <SkillsContext.Provider value={value}>{children}</SkillsContext.Provider>
  );
};

SkillsProvider.displayName = "SkillsProvider";
