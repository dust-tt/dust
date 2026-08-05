import { useBlockedSkillSpaceRemovalConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillSpaceRestrictionsContext } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import type { SpaceType } from "@app/types/space";
import { useCallback } from "react";
import { useController } from "react-hook-form";

/**
 * Removes a space from the skill, or explains why it cannot be removed.
 *
 * A space that a tool, an attached knowledge or a nested skill depends on is not in
 * `additionalSpaces` at all, so it cannot be dropped without first editing whatever pulls it in.
 * For those, `removeSpace` opens the blocking dialog that lists the culprits instead.
 */
export function useRemoveSkillSpace() {
  const { field: additionalSpacesField } = useController<
    SkillBuilderFormData,
    "additionalSpaces"
  >({
    name: "additionalSpaces",
  });

  const { mcpServerViews } = useMCPServerViewsContext();
  const confirmBlockedSpaceRemoval = useBlockedSkillSpaceRemovalConfirm({
    mcpServerViews,
  });

  const {
    actionsBySpaceId,
    areSpaceRequirementsReady,
    knowledgeBySpaceId,
    skillsBySpaceId,
    spaceIdsUsedBySkill,
  } = useSkillSpaceRestrictionsContext();

  const selectedAdditionalSpaces = additionalSpacesField.value ?? [];
  const isReadOnly = additionalSpacesField.disabled ?? false;

  const removeSpace = useCallback(
    async (space: SpaceType) => {
      if (!areSpaceRequirementsReady) {
        return;
      }

      if (spaceIdsUsedBySkill.has(space.sId)) {
        await confirmBlockedSpaceRemoval({
          space,
          actions: actionsBySpaceId[space.sId] ?? [],
          knowledge: knowledgeBySpaceId[space.sId] ?? [],
          skills: (skillsBySpaceId[space.sId] ?? []).map((skill) => ({
            sId: skill.id,
            name: skill.name,
            icon: skill.icon,
          })),
        });
        return;
      }

      additionalSpacesField.onChange(
        selectedAdditionalSpaces.filter((spaceId) => spaceId !== space.sId)
      );
    },
    [
      actionsBySpaceId,
      additionalSpacesField,
      areSpaceRequirementsReady,
      confirmBlockedSpaceRemoval,
      knowledgeBySpaceId,
      selectedAdditionalSpaces,
      skillsBySpaceId,
      spaceIdsUsedBySkill,
    ]
  );

  return {
    removeSpace,
    isRemovalDisabled: isReadOnly || !areSpaceRequirementsReady,
  };
}
