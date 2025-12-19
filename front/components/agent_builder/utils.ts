import { useController } from "react-hook-form";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import type { ActionType } from "@app/components/shared/getSpaceIdToActionsMap";
import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type { TemplateTagCodeType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export const isInvalidJson = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  try {
    const parsed = JSON.parse(value);
    return !parsed || typeof parsed !== "object";
  } catch {
    return true;
  }
};

export function getUniqueTemplateTags(
  templates: AssistantTemplateListType[]
): TemplateTagCodeType[] {
  return Array.from(
    new Set(templates.flatMap((template) => template.tags))
  ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/**
 * Helper hook to access the `sources`.
 * As a single `useController` can be use to access a given attribute.
 */
export function useSourcesFormController() {
  return useController<CapabilityFormData, "sources">({ name: "sources" });
}

export function getActionsAndSkillsRequestedSpaceIds(
  selectedSkills: AgentBuilderSkillsType[],
  allSkills: SkillType[],
  spaceIdToActions: Record<string, ActionType[]>
): Set<string> {
  const selectedSkillIds = new Set(selectedSkills.map((s) => s.sId));
  const skillRequestedSpaceIds = new Set(
    allSkills
      .filter((skill) => selectedSkillIds.has(skill.sId))
      .flatMap((skill) => skill.requestedSpaceIds)
  );

  const actionRequestedSpaceIds = new Set<string>();
  for (const spaceId of Object.keys(spaceIdToActions)) {
    if (spaceIdToActions[spaceId]?.length > 0) {
      actionRequestedSpaceIds.add(spaceId);
    }
  }

  return new Set([...skillRequestedSpaceIds, ...actionRequestedSpaceIds]);
}
