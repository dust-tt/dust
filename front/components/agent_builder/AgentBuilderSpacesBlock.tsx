import { Chip } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { RemoveSpaceDialog } from "@app/components/shared/RemoveSpaceDialog";
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

  const [spaceToRemove, setSpaceToRemove] = useState<SpaceType | null>(null);

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

  const handleRemoveSpace = (space: SpaceType) => {
    setSpaceToRemove(space);
  };

  const handleConfirmRemove = () => {
    if (!spaceToRemove) {
      return;
    }

    // Remove actions (knowledge + tools) that belong to this space
    // TODO(skill): if knowledge have data from several spaces, edit the knowledge to only remove the data from this space
    const actionsToRemove = spaceIdToActions[spaceToRemove.sId] || [];
    const actionIdsToRemove = new Set(actionsToRemove.map((a) => a.id));
    const newActions = actions.filter((a) => !actionIdsToRemove.has(a.id));
    setValue("actions", newActions);

    // Remove skills that have this space in their requestedSpaceIds
    const newSkills = selectedSkills.filter(
      (skill) =>
        !allSkills
          .find((s) => s.sId === skill.sId)
          ?.requestedSpaceIds.includes(spaceToRemove.sId)
    );
    setValue("skills", newSkills);

    setSpaceToRemove(null);
  };

  if (nonGlobalSpacesWithRestrictions.length === 0) {
    return null;
  }

  // Compute items to remove for the dialog
  const actionsToRemove = spaceToRemove
    ? (spaceIdToActions[spaceToRemove.sId] || []).filter(
        (action): action is BuilderAction => action.type === "MCP"
      )
    : [];

  const skillsToRemove = spaceToRemove
    ? selectedSkills.filter((skill) =>
        allSkills
          .find((s) => s.sId === skill.sId)
          ?.requestedSpaceIds.includes(spaceToRemove.sId)
      )
    : [];

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

      <RemoveSpaceDialog
        space={spaceToRemove}
        entityName="agent"
        actions={actionsToRemove}
        skills={skillsToRemove}
        mcpServerViews={mcpServerViews}
        onClose={() => setSpaceToRemove(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
