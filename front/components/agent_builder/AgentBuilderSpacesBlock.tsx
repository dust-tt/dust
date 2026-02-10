import {
  Button,
  ContentMessage,
  PlanetIcon,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useRemoveSpaceConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useSpaceProjectsLookup } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";

interface AgentBuilderSpacesBlockProps {
  initialRequestedSpaceIds?: string[];
}

export function AgentBuilderSpacesBlock({
  initialRequestedSpaceIds,
}: AgentBuilderSpacesBlockProps) {
  const { setValue } = useFormContext<AgentBuilderFormData>();

  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();
  const { spaces, owner, isSpacesLoading } = useSpacesContext();

  // The agent might be linked to some open projects that the user is not
  // a member of, so we fetch them here.
  const missingSpaceIds = useMemo(() => {
    if (isSpacesLoading || !initialRequestedSpaceIds?.length) {
      return [];
    }
    const existingSpaceIds = new Set(spaces.map((s) => s.sId));

    return initialRequestedSpaceIds.filter((id) => !existingSpaceIds.has(id));
  }, [isSpacesLoading, initialRequestedSpaceIds, spaces]);

  const { spaces: missingSpaces } = useSpaceProjectsLookup({
    workspaceId: owner.sId,
    spaceIds: missingSpaceIds,
  });

  const allSpaces = useMemo(() => {
    return [...spaces, ...missingSpaces];
  }, [spaces, missingSpaces]);

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isProjectsEnabled = hasFeature("projects");

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>([]);
  const [spaceSearchQuery, setSpaceSearchQuery] = useState("");

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
    const nonGlobalSpaces = allSpaces.filter((s) => s.kind !== "global");
    const allRequestedSpaceIds = new Set([
      ...actionsAndSkillsRequestedSpaceIds,
      ...additionalSpaces,
    ]);

    return nonGlobalSpaces.filter((s) => allRequestedSpaceIds.has(s.sId));
  }, [allSpaces, actionsAndSkillsRequestedSpaceIds, additionalSpaces]);

  const { displayProjectWarning, privateProjectWithoutWarning } =
    useMemo(() => {
      const allRequestedSpaceIds = new Set([
        ...actionsAndSkillsRequestedSpaceIds,
        ...additionalSpaces,
      ]);

      const selectedPrivateSpaces = allSpaces.filter(
        (s) =>
          s.kind !== "global" &&
          allRequestedSpaceIds.has(s.sId) &&
          s.isRestricted
      );

      const displayProjectWarning = selectedPrivateSpaces.length > 0;

      const privateProjectWithoutWarning =
        selectedPrivateSpaces.length === 1 &&
        selectedPrivateSpaces[0].kind === "project"
          ? selectedPrivateSpaces[0]
          : null;

      return { displayProjectWarning, privateProjectWithoutWarning };
    }, [allSpaces, actionsAndSkillsRequestedSpaceIds, additionalSpaces]);

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

  const globalSpace = useMemo(() => {
    return allSpaces.find((s) => s.kind === "global");
  }, [allSpaces]);

  const spacesToDisplay = useMemo(() => {
    return removeNulls([globalSpace, ...nonGlobalSpacesWithRestrictions]);
  }, [globalSpace, nonGlobalSpacesWithRestrictions]);

  return (
    <div className="space-y-3 px-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-lg text-foreground dark:text-foreground-night">
            {isProjectsEnabled ? "Spaces and Projects" : "Spaces"}
          </h2>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Set what knowledge and capabilities the agent can access.
          </p>
        </div>
        <Button
          label="Manage"
          icon={PlanetIcon}
          variant="outline"
          onClick={handleOpenSheet}
        />
      </div>
      {nonGlobalSpacesWithRestrictions.length > 0 && (
        <div className="mb-4 w-full">
          <ContentMessage variant="golden" size="lg">
            Based on your selection of knowledge and capabilities, this agent
            can only be used by users with access to:{" "}
            <strong>
              {nonGlobalSpacesWithRestrictions.map((v) => v.name).join(", ")}
            </strong>
            .
            {isProjectsEnabled &&
              displayProjectWarning &&
              (privateProjectWithoutWarning ? (
                <>
                  <br />
                  <br />
                  Based on your selection of knowledge and capabilities, this
                  agent will only be available in the following project:{" "}
                  <strong>{privateProjectWithoutWarning.name}</strong>
                </>
              ) : (
                <>
                  <br />
                  <br />
                  Based on your selection of knowledge and capabilities, this
                  agent will be unavailable in project conversations.
                </>
              ))}
          </ContentMessage>
        </div>
      )}
      <SpaceChips spaces={spacesToDisplay} onRemoveSpace={handleRemoveSpace} />

      <Sheet open={isSheetOpen} onOpenChange={handleCloseSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {isProjectsEnabled ? "Add Spaces and Projects" : "Add Spaces"}
            </SheetTitle>
            <SheetDescription>
              {isProjectsEnabled
                ? "Choose the spaces and projects you want the agent to have access to."
                : "Choose the spaces you want the agent to have access to."}
            </SheetDescription>
            <SearchInput
              name="space"
              onChange={(s) => setSpaceSearchQuery(s)}
              value={spaceSearchQuery}
              placeholder={
                isProjectsEnabled
                  ? "Search spaces and projects"
                  : "Search spaces"
              }
              className="mt-4"
            />
          </SheetHeader>
          <SheetContainer className="p-0">
            <SpaceSelectionPageContent
              alreadyRequestedSpaceIds={actionsAndSkillsRequestedSpaceIds}
              selectedSpaces={draftSelectedSpaces}
              setSelectedSpaces={setDraftSelectedSpaces}
              searchQuery={spaceSearchQuery}
              missingSpaceIds={missingSpaceIds}
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
