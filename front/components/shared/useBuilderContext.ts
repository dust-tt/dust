import { useContext } from "react";

import { AgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { SkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { UserType, WorkspaceType } from "@app/types";

type BuilderContextValue = {
  owner: WorkspaceType;
  user: UserType;
};

/** Hook to access the builder context, which can be either AgentBuilderContext or SkillBuilderContext */
export function useBuilderContext(): BuilderContextValue {
  const agentBuilderContext = useContext(AgentBuilderContext);
  const skillBuilderContext = useContext(SkillBuilderContext);
  if (agentBuilderContext) {
    const { owner, user } = agentBuilderContext;
    return { owner, user };
  }
  if (skillBuilderContext) {
    return skillBuilderContext;
  }

  throw new Error(
    "useBuilderContext must be used within an AgentBuilderProvider or SkillBuilderProvider"
  );
}
