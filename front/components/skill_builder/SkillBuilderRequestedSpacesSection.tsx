import { SpaceSelectionSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSpaceProjectsLookup } from "@app/lib/swr/spaces";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";
import { Button, ContentMessage, PlanetIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

interface SkillBuilderRequestedSpacesSectionProps {
  initialRequestedSpaceIds?: string[];
}

export function SkillBuilderRequestedSpacesSection({
  initialRequestedSpaceIds,
}: SkillBuilderRequestedSpacesSectionProps) {
  const {
    setValue,
    formState: { isDirty },
  } = useFormContext<SkillBuilderFormData>();

  const tools = useWatch<SkillBuilderFormData, "tools">({ name: "tools" });
  const attachedKnowledge = useWatch<SkillBuilderFormData, "attachedKnowledge">(
    {
      name: "attachedKnowledge",
    }
  );
  const additionalSpaces = useWatch<SkillBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });
  const selectedAdditionalSpaces = additionalSpaces ?? [];

  const { hasFeature } = useFeatureFlags();
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const { spaces, owner, isSpacesLoading } = useSpacesContext();

  const isProjectsEnabled = hasFeature("projects");

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
    return [...spaces, ...missingSpaces];
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
    if (!areSpaceRequirementsReady || !initialRequestedSpaceIds || isDirty) {
      return;
    }

    setValue("additionalSpaces", initialAdditionalSpaces, {
      shouldDirty: false,
    });
  }, [
    areSpaceRequirementsReady,
    initialAdditionalSpaces,
    initialRequestedSpaceIds,
    isDirty,
    setValue,
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

  const handleRemoveSpace = (space: SpaceType) => {
    setValue(
      "additionalSpaces",
      selectedAdditionalSpaces.filter((spaceId) => spaceId !== space.sId),
      { shouldDirty: true }
    );
  };

  const canRemoveSpace = (space: SpaceType) => {
    return (
      areSpaceRequirementsReady &&
      additionalSpaceIds.has(space.sId) &&
      !spaceIdsUsedBySkill.has(space.sId)
    );
  };

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
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
            {isProjectsEnabled ? "Spaces and Projects" : "Spaces"}
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
            can only be used by users with access to:{" "}
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
        onRemoveSpace={handleRemoveSpace}
        canRemoveSpace={canRemoveSpace}
      />

      <SpaceSelectionSheet
        alreadyRequestedSpaceIds={spaceIdsUsedBySkill}
        entityName="skill"
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
