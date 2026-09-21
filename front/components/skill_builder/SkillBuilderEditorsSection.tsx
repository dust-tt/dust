import { SkillEditorsAccessWarning } from "@app/components/skill_builder/SkillEditorsAccessWarning";
import { SkillEditorsSheetWithButton } from "@app/components/skill_builder/SkillEditorsSheetWithButton";
import { useSkillSpaceRestrictionsContext } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import type { WorkspaceType } from "@app/types/user";

interface SkillBuilderEditorsSectionProps {
  isEditorGateVisible: boolean;
  isAddingSelfAsEditor: boolean;
  onAddSelfAsEditor: () => void;
  owner: WorkspaceType;
}

export function SkillBuilderEditorsSection({
  isEditorGateVisible,
  isAddingSelfAsEditor,
  onAddSelfAsEditor,
  owner,
}: SkillBuilderEditorsSectionProps) {
  const { editorsWithoutSpaceAccess } = useSkillSpaceRestrictionsContext();

  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">Editors</h3>
      <div className="flex w-full flex-row flex-wrap items-center gap-2">
        <SkillEditorsSheetWithButton
          isEditorGateVisible={isEditorGateVisible}
          isAddingSelfAsEditor={isAddingSelfAsEditor}
          onAddSelfAsEditor={onAddSelfAsEditor}
        />
      </div>
      {editorsWithoutSpaceAccess.length > 0 && (
        <SkillEditorsAccessWarning
          editorsWithoutSpaceAccess={editorsWithoutSpaceAccess}
          owner={owner}
        />
      )}
    </div>
  );
}
