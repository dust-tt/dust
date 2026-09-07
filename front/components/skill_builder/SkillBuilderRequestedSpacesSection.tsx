import { SpaceSelectionSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillSpaceRestrictionsContext } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import { useRemoveSkillSpace } from "@app/components/skill_builder/useRemoveSkillSpace";
import { removeNulls } from "@app/types/shared/utils/general";
import { Button, Planet } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useController } from "react-hook-form";

export function SkillBuilderRequestedSpacesSection() {
  const { field: additionalSpacesField } = useController<
    SkillBuilderFormData,
    "additionalSpaces"
  >({
    name: "additionalSpaces",
  });
  const isReadOnly = additionalSpacesField.disabled ?? false;
  const selectedAdditionalSpaces = additionalSpacesField.value ?? [];

  const { removeSpace } = useRemoveSkillSpace();

  const {
    areSpaceRequirementsReady,
    globalSpace,
    missingSpaceIds,
    nonGlobalSpacesUsedBySkill,
    spaceIdsUsedBySkill,
  } = useSkillSpaceRestrictionsContext();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>([]);

  const handleOpenSheet = () => {
    if (!areSpaceRequirementsReady) {
      return;
    }

    // Keep every manually selected space in the draft, including the ones resources in the skill
    // also requires. The sheet renders those rows selected and locked, so they cannot be toggled
    // off.
    setDraftSelectedSpaces(selectedAdditionalSpaces);
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
        onRemoveSpace={isReadOnly ? undefined : removeSpace}
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
