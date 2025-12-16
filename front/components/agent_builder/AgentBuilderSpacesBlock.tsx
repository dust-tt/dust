import { Chip } from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useRemoveSpaceConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

export function AgentBuilderSpacesBlock() {
  const { watch, setValue } = useFormContext<AgentBuilderFormData>();

  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();
  const { spaces } = useSpacesContext();

  const selectedSkills = watch("skills");
  const actions = watch("actions");

  const confirmRemoveSpace = useRemoveSpaceConfirm({
    entityName: "agent",
    mcpServerViews,
  });

  // Compute requested spaces from tools/knowledge (actions)
  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  // Merge requested spaces from skills and from actions
  const nonGlobalSpacesWithRestrictions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");

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

    const allRequestedSpaceIds = new Set([
      ...skillRequestedSpaceIds,
      ...actionRequestedSpaceIds,
    ]);

    return nonGlobalSpaces.filter((s) => allRequestedSpaceIds.has(s.sId));
  }, [spaces, selectedSkills, allSkills, spaceIdToActions]);

  const handleRemoveSpace = async (space: SpaceType) => {
    // Compute items to remove for the dialog
    const actionsToRemove = (spaceIdToActions[space.sId] || []).filter(
      (action): action is BuilderAction => action.type === "MCP"
    );

    const skillsToRemove = selectedSkills.filter((skill) =>
      allSkills
        .find((s) => s.sId === skill.sId)
        ?.requestedSpaceIds.includes(space.sId)
    );

    const confirmed = await confirmRemoveSpace(
      space,
      actionsToRemove,
      skillsToRemove
    );

    if (!confirmed) {
      return;
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
  };

  if (nonGlobalSpacesWithRestrictions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 px-6">
      <div>
        <h2 className="heading-lg text-foreground dark:text-foreground-night">
          Spaces
        </h2>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Determines who can use this agent and what data it can access
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {nonGlobalSpacesWithRestrictions.map((space) => (
          <Chip
            key={space.sId}
            label={getSpaceName(space)}
            icon={getSpaceIcon(space)}
            onRemove={() => handleRemoveSpace(space)}
          />
        ))}
      </div>
    </div>
  );
}
