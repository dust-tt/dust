import { SpaceSelectionSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import { useBlockedSkillSpaceRemovalConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillSpaceRestrictionsContext } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";
import { Button, Planet } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

export function SkillBuilderRequestedSpacesSection() {
  const { resetField } = useFormContext<SkillBuilderFormData>();

  const {
    field: additionalSpacesField,
    fieldState: additionalSpacesFieldState,
  } = useController<SkillBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });
  const isReadOnly = additionalSpacesField.disabled ?? false;
  const selectedAdditionalSpaces = additionalSpacesField.value ?? [];

  const { mcpServerViews } = useMCPServerViewsContext();
  const confirmBlockedSpaceRemoval = useBlockedSkillSpaceRemovalConfirm({
    mcpServerViews,
  });

  const {
    actionsBySpaceId,
    areSpaceRequirementsReady,
    globalSpace,
    initialAdditionalSpaces,
    initialRequestedSpaceIds,
    knowledgeBySpaceId,
    missingSpaceIds,
    nonGlobalSpacesUsedBySkill,
    skillsBySpaceId,
    spaceIdsUsedBySkill,
  } = useSkillSpaceRestrictionsContext();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>([]);

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

  const handleRemoveSpace = async (space: SpaceType) => {
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
    additionalSpacesField.onChange(draftSelectedSpaces);
    handleCloseSheet();
  };

  const spacesToDisplay = useMemo(() => {
    return removeNulls([globalSpace, ...nonGlobalSpacesUsedBySkill]);
  }, [globalSpace, nonGlobalSpacesUsedBySkill]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="heading-lg font-semibold text-foreground">
            Data and access
          </h3>
          <p className="text-sm text-muted-foreground">
            Adding spaces or pods will make the data from each of them available
            to the skill. Only members of all the spaces and pods listed will
            have access to the skill.
          </p>
        </div>
        <Button
          label="Manage"
          icon={Planet}
          variant="outline"
          disabled={isReadOnly || !areSpaceRequirementsReady}
          onClick={handleOpenSheet}
        />
      </div>
      <SpaceChips
        spaces={spacesToDisplay}
        onRemoveSpace={isReadOnly ? undefined : handleRemoveSpace}
      />

      <SpaceSelectionSheet
        alreadyRequestedSpaceIds={spaceIdsUsedBySkill}
        entityName="skill"
        missingSpaceIds={missingSpaceIds}
        onClose={handleCloseSheet}
        onSave={handleSaveSpaces}
        open={isSheetOpen && !isReadOnly}
        selectedSpaces={draftSelectedSpaces}
        setSelectedSpaces={setDraftSelectedSpaces}
      />
    </div>
  );
}
