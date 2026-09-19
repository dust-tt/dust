import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useRemoveSpaceConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { SpaceType } from "@app/types/space";
import { useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";

/**
 * Removes a space from the agent. Unlike skills, an agent space removal is never blocked: the
 * actions and skills that depend on the space are removed along with it, after the user confirms
 * the removal in a dialog listing them.
 */
export function useRemoveAgentSpace({
  spaceIdToActions,
}: {
  spaceIdToActions: ReturnType<typeof getSpaceIdToActionsMap>;
}) {
  const { setValue } = useFormContext<AgentBuilderFormData>();

  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();

  const selectedSkills = useWatch<AgentBuilderFormData, "skills">({
    name: "skills",
  });
  const actions = useWatch<AgentBuilderFormData, "actions">({
    name: "actions",
  });
  const additionalSpaces = useWatch<AgentBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });

  const confirmRemoveSpace = useRemoveSpaceConfirm({
    entityName: "agent",
    mcpServerViews,
  });

  const removeSpace = useCallback(
    async (space: SpaceType) => {
      // Compute items to remove for the dialog
      const actionsToRemove = spaceIdToActions[space.sId] || [];

      const skillsToRemove = selectedSkills.filter((skill) =>
        allSkills
          .find((s) => s.sId === skill.sId)
          ?.requestedSpaceIds.includes(space.sId)
      );

      // Only show the confirmation dialog if there are resources to remove.
      if (actionsToRemove.length > 0 || skillsToRemove.length > 0) {
        const confirmed = await confirmRemoveSpace({
          space,
          actions: actionsToRemove,
          skills: allSkills.filter((skill) =>
            skillsToRemove.some((s) => s.sId === skill.sId)
          ),
        });

        if (!confirmed) {
          return;
        }
      }

      // Remove actions (knowledge + tools) that belong to this space
      const actionIdsToRemove = new Set(actionsToRemove.map((a) => a.id));
      const newActions = actions.filter((a) => !actionIdsToRemove.has(a.id));
      setValue("actions", newActions, { shouldDirty: true });

      // Remove skills that have this space in their requestedSpaceIds
      const newSkills = selectedSkills.filter(
        (skill) =>
          !allSkills
            .find((s) => s.sId === skill.sId)
            ?.requestedSpaceIds.includes(space.sId)
      );
      setValue("skills", newSkills, { shouldDirty: true });

      const newAdditionalSpaces = additionalSpaces.filter(
        (spaceId) => spaceId !== space.sId
      );
      setValue("additionalSpaces", newAdditionalSpaces, { shouldDirty: true });
    },
    [
      actions,
      additionalSpaces,
      allSkills,
      confirmRemoveSpace,
      selectedSkills,
      setValue,
      spaceIdToActions,
    ]
  );

  return { removeSpace };
}
