import { useMemo } from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SpaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export function computeSkillsAndActionsState({
  skillFields,
  actionFields,
  mcpServerViews,
  allSkills,
  spaces,
}: {
  skillFields: AgentBuilderSkillsType[];
  actionFields: BuilderAction[];
  mcpServerViews: MCPServerViewType[];
  allSkills: SkillType[];
  spaces: SpaceType[];
}): {
  alreadyAddedSkillIds: Set<string>;
  alreadyRequestedSpaceIds: Set<string>;
  nonGlobalSpacesUsedInActions: SpaceType[];
} {
  const alreadyAddedSkillIds = new Set(skillFields.map((s) => s.sId));
  const spaceIdToActions = getSpaceIdToActionsMap(actionFields, mcpServerViews);

  const alreadyRequestedSpaceIds = new Set<string>();
  for (const spaceId of Object.keys(spaceIdToActions)) {
    if (spaceIdToActions[spaceId]?.length > 0) {
      alreadyRequestedSpaceIds.add(spaceId);
    }
  }

  for (const skill of allSkills) {
    if (alreadyAddedSkillIds.has(skill.sId) && skill.canWrite) {
      for (const spaceId of skill.requestedSpaceIds) {
        alreadyRequestedSpaceIds.add(spaceId);
      }
    }
  }

  const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
  const nonGlobalSpacesUsedInActions = nonGlobalSpaces.filter(
    (s) => spaceIdToActions[s.sId]?.length > 0
  );

  return {
    alreadyAddedSkillIds,
    alreadyRequestedSpaceIds,
    nonGlobalSpacesUsedInActions,
  };
}

export function useSkillsAndActionsState(
  skillFields: AgentBuilderSkillsType[],
  actionFields: BuilderAction[],
  mcpServerViews: MCPServerViewType[],
  allSkills: SkillType[],
  spaces: SpaceType[]
) {
  return useMemo(() => {
    return computeSkillsAndActionsState({
      skillFields,
      actionFields,
      mcpServerViews,
      allSkills,
      spaces,
    });
  }, [skillFields, actionFields, mcpServerViews, allSkills, spaces]);
}
