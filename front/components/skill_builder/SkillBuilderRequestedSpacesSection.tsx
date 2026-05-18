import { SpaceSelectionSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useBlockedSkillSpaceRemovalConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSpaceProjectsLookup } from "@app/lib/swr/spaces";
import { removeNulls } from "@app/types/shared/utils/general";
import { Button, ContentMessage, PlanetIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

interface SkillBuilderRequestedSpacesSectionProps {
  initialRequestedSpaceIds?: string[];
}

export function SkillBuilderRequestedSpacesSection({
  initialRequestedSpaceIds,
}: SkillBuilderRequestedSpacesSectionProps) {
  const { resetField } = useFormContext<SkillBuilderFormData>();

  const tools = useWatch<SkillBuilderFormData, "tools">({ name: "tools" });
  const attachedKnowledge = useWatch<SkillBuilderFormData, "attachedKnowledge">(
    {
      name: "attachedKnowledge",
    }
  );

  const {
    field: additionalSpacesField,
    fieldState: additionalSpacesFieldState,
  } = useController<SkillBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });
  const selectedAdditionalSpaces = additionalSpacesField.value ?? [];

  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const { spaces, owner, isSpacesLoading } = useSpacesContext();
  const confirmBlockedSpaceRemoval = useBlockedSkillSpaceRemovalConfirm({
    mcpServerViews,
  });

  const missingSpaceIds = useMemo(() => {
    if (isSpacesLoading || !initialRequestedSpaceIds?.length) {
      return [];
    }

    const existingSpaceIds = new Set(spaces.map((space) => space.sId));
    return initialRequestedSpaceIds.filter((id) => !existingSpaceIds.has(id));
  }, [isSpacesLoading, initialRequestedSpaceIds, spaces]);

  const { spaces: missingSpaces } = useSpaceProjectsLookup({
    workspaceId: owner.sId,
    spaceIds: missingSpaceIds,
  });

  const allSpaces = useMemo(() => {
    return [...spaces, ...missingSpaces].filter(
      (space) => space.kind !== "project"
    );
  }, [spaces, missingSpaces]);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>([]);

  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(tools ?? [], mcpServerViews);
  }, [tools, mcpServerViews]);

  const spaceIdsFromKnowledge = useMemo(() => {
    return new Set(attachedKnowledge?.map((k) => k.spaceId) ?? []);
  }, [attachedKnowledge]);

  const spaceIdsUsedBySkill = useMemo(() => {
    const actionRequestedSpaceIds = Object.keys(spaceIdToActions).filter(
      (spaceId) => spaceIdToActions[spaceId]?.length > 0
    );

    return new Set([...actionRequestedSpaceIds, ...spaceIdsFromKnowledge]);
  }, [spaceIdToActions, spaceIdsFromKnowledge]);

  const areSpaceRequirementsReady =
    !isMCPServerViewsLoading &&
    (!initialRequestedSpaceIds || attachedKnowledge !== undefined);

  const knowledgeBySpaceId = useMemo(() => {
    const knowledgeBySpace: Record<
      string,
      NonNullable<typeof attachedKnowledge>
    > = {};

    for (const knowledge of attachedKnowledge ?? []) {
      knowledgeBySpace[knowledge.spaceId] = (
        knowledgeBySpace[knowledge.spaceId] ?? []
      ).concat(knowledge);
    }

    return knowledgeBySpace;
  }, [attachedKnowledge]);

  const initialAdditionalSpaces = useMemo(() => {
    if (!areSpaceRequirementsReady || !initialRequestedSpaceIds?.length) {
      return [];
    }

    return initialRequestedSpaceIds.filter(
      (spaceId) => !spaceIdsUsedBySkill.has(spaceId)
    );
  }, [
    areSpaceRequirementsReady,
    initialRequestedSpaceIds,
    spaceIdsUsedBySkill,
  ]);

  useEffect(() => {
    if (
      !areSpaceRequirementsReady ||
      !initialRequestedSpaceIds ||
      additionalSpacesFieldState.isDirty
    ) {
      return;
    }

    resetField("additionalSpaces", {
      defaultValue: initialAdditionalSpaces,
    });
  }, [
    areSpaceRequirementsReady,
    additionalSpacesFieldState.isDirty,
    initialAdditionalSpaces,
    initialRequestedSpaceIds,
    resetField,
  ]);

  const additionalSpaceIds = useMemo(() => {
    return new Set(selectedAdditionalSpaces);
  }, [selectedAdditionalSpaces]);

  const nonGlobalSpacesWithRestrictions = useMemo(() => {
    return allSpaces.filter(
      (space) =>
        space.kind !== "global" &&
        (spaceIdsUsedBySkill.has(space.sId) ||
          additionalSpaceIds.has(space.sId))
    );
  }, [additionalSpaceIds, allSpaces, spaceIdsUsedBySkill]);

  const handleOpenSheet = () => {
    if (!areSpaceRequirementsReady) {
      return;
    }

    setDraftSelectedSpaces(
      selectedAdditionalSpaces.filter(
        (spaceId) => !spaceIdsUsedBySkill.has(spaceId)
      )
    );
    setIsSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setIsSheetOpen(false);
    setDraftSelectedSpaces([]);
  };

  const handleSaveSpaces = () => {
    additionalSpacesField.onChange(draftSelectedSpaces);
    handleCloseSheet();
  };

  const globalSpace = useMemo(() => {
    return allSpaces.find((s) => s.kind === "global");
  }, [allSpaces]);

  const spacesToDisplay = useMemo(() => {
    return removeNulls([globalSpace, ...nonGlobalSpacesWithRestrictions]);
  }, [globalSpace, nonGlobalSpacesWithRestrictions]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
            Spaces
          </h3>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Set what knowledge and tools the skill can access.
          </p>
        </div>
        <Button
          label="Manage"
          icon={PlanetIcon}
          variant="outline"
          disabled={!areSpaceRequirementsReady}
          onClick={handleOpenSheet}
        />
      </div>
      {nonGlobalSpacesWithRestrictions.length > 0 && (
        <div className="mb-4 w-full">
          <ContentMessage variant="golden" size="lg">
            Based on your selection of spaces, knowledge, and tools, this skill
            can only be used by users with access to:&nbsp;
            <strong>
              {nonGlobalSpacesWithRestrictions
                .map((space) => space.name)
                .join(", ")}
            </strong>
            .
          </ContentMessage>
        </div>
      )}
      <SpaceChips
        spaces={spacesToDisplay}
        onRemoveSpace={async (space) => {
          if (!areSpaceRequirementsReady) {
            return;
          }

          if (spaceIdsUsedBySkill.has(space.sId)) {
            await confirmBlockedSpaceRemoval({
              space,
              actions: spaceIdToActions[space.sId] ?? [],
              knowledgeInInstructions: knowledgeBySpaceId[space.sId] ?? [],
            });
            return;
          }

          additionalSpacesField.onChange(
            selectedAdditionalSpaces.filter((spaceId) => spaceId !== space.sId)
          );
        }}
        canRemoveSpace={(space) =>
          areSpaceRequirementsReady &&
          (additionalSpaceIds.has(space.sId) ||
            spaceIdsUsedBySkill.has(space.sId))
        }
      />

      <SpaceSelectionSheet
        alreadyRequestedSpaceIds={spaceIdsUsedBySkill}
        entityName="skill"
        includeProjects={false}
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
