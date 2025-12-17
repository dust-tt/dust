import {
  Button,
  Chip,
  PlanetIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SpaceSelectionPage";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useRemoveSpaceConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

export function AgentBuilderSpacesBlock() {
  const { setValue } = useFormContext<AgentBuilderFormData>();

  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();
  const { spaces } = useSpacesContext();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>([]);

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
    allSkills,
  });

  // Compute requested spaces from tools/knowledge (actions)
  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  // Merge requested spaces from skills, actions, and additional spaces (from global skills)
  const actionsAndSkillsRequestedSpaceIds = useMemo(() => {
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
  }, [selectedSkills, allSkills, spaceIdToActions]);

  const nonGlobalSpacesWithRestrictions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    const allRequestedSpaceIds = new Set([
      ...actionsAndSkillsRequestedSpaceIds,
      ...additionalSpaces,
    ]);

    return nonGlobalSpaces.filter((s) => allRequestedSpaceIds.has(s.sId));
  }, [spaces, actionsAndSkillsRequestedSpaceIds, additionalSpaces]);

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

    // Only show confirmation dialog if there are resources to remove
    if (actionsToRemove.length > 0 || skillsToRemove.length > 0) {
      const confirmed = await confirmRemoveSpace(
        space,
        actionsToRemove,
        skillsToRemove
      );

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
  };

  const handleOpenSheet = () => {
    // Initialize with current additional spaces so they appear selected
    setDraftSelectedSpaces([...additionalSpaces]);
    setIsSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setIsSheetOpen(false);
    setDraftSelectedSpaces([]);
  };

  const handleSaveSpaces = () => {
    setValue("additionalSpaces", draftSelectedSpaces, { shouldDirty: true });
    handleCloseSheet();
  };

  return (
    <div className="space-y-3 px-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-lg text-foreground dark:text-foreground-night">
            Spaces
          </h2>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Determines who can use this agent and what data it can access
          </p>
        </div>
        <Button
          label="Add space"
          icon={PlanetIcon}
          variant="outline"
          onClick={handleOpenSheet}
        />
      </div>
      {nonGlobalSpacesWithRestrictions.length > 0 && (
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
      )}

      <Sheet open={isSheetOpen} onOpenChange={handleCloseSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Spaces</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <SpaceSelectionPageContent
              alreadyRequestedSpaceIds={actionsAndSkillsRequestedSpaceIds}
              draftSelectedSpaces={draftSelectedSpaces}
              setDraftSelectedSpaces={setDraftSelectedSpaces}
            />
          </SheetContainer>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: handleCloseSheet,
            }}
            rightButtonProps={{
              label: "Save",
              variant: "primary",
              onClick: handleSaveSpaces,
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
