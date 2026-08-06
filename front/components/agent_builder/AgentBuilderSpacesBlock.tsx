import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SpaceSelectionSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import { useAgentRequestedSpaces } from "@app/components/agent_builder/hooks/useAgentRequestedSpaces";
import { useRemoveSpaceConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";
import { Button, Planet } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

interface AgentBuilderSpacesBlockProps {
  initialRequestedSpaceIds?: string[];
}

export function AgentBuilderSpacesBlock({
  initialRequestedSpaceIds,
}: AgentBuilderSpacesBlockProps) {
  const { setValue } = useFormContext<AgentBuilderFormData>();

  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();

  const {
    actionsAndSkillsRequestedSpaceIds,
    globalSpace,
    missingSpaceIds,
    nonGlobalSpacesUsedByAgent,
    spaceIdToActions,
  } = useAgentRequestedSpaces({ initialRequestedSpaceIds });

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
  });

  const handleRemoveSpace = async (space: SpaceType) => {
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

  const spacesToDisplay = useMemo(() => {
    return removeNulls([globalSpace, ...nonGlobalSpacesUsedByAgent]);
  }, [globalSpace, nonGlobalSpacesUsedByAgent]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-lg text-foreground">Data and access</h2>
          <p className="text-sm text-muted-foreground max-w-9/10">
            Adding spaces or pods will make the data from each of them available
            to the agent. Only members of all the spaces and pods listed will
            have access to the agent.
          </p>
        </div>
        <Button
          label="Manage"
          icon={Planet}
          variant="outline"
          onClick={handleOpenSheet}
        />
      </div>
      <SpaceChips spaces={spacesToDisplay} onRemoveSpace={handleRemoveSpace} />

      <SpaceSelectionSheet
        alreadyRequestedSpaceIds={actionsAndSkillsRequestedSpaceIds}
        entityName="agent"
        missingSpaceIds={missingSpaceIds}
        onClose={handleCloseSheet}
        onSave={handleSaveSpaces}
        open={isSheetOpen}
        selectedSpaces={draftSelectedSpaces}
        setSelectedSpaces={setDraftSelectedSpaces}
      />
    </div>
  );
}
