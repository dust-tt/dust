import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { BecomeEditorButton } from "@app/components/shared/BecomeEditorButton";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { Button, Users01 } from "@dust-tt/sparkle";
import { useState } from "react";
import { useController } from "react-hook-form";

interface SkillEditorsSheetProps {
  isEditorGateVisible: boolean;
  isAddingSelfAsEditor: boolean;
  onAddSelfAsEditor: () => void;
}

export function SkillEditorsSheet({
  isEditorGateVisible,
  isAddingSelfAsEditor,
  onAddSelfAsEditor,
}: SkillEditorsSheetProps) {
  const { owner } = useSkillBuilderContext();
  const [isOpen, setIsOpen] = useState(false);

  const { field: editorsField } = useController<
    SkillBuilderFormData,
    "editors"
  >({
    name: "editors",
  });
  const isReadOnly = editorsField.disabled ?? false;

  if (isEditorGateVisible) {
    return (
      <BecomeEditorButton
        isLoading={isAddingSelfAsEditor}
        onClick={onAddSelfAsEditor}
      />
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        icon={Users01}
        label="Editors"
        disabled={isReadOnly}
        onClick={() => setIsOpen(true)}
        type="button"
      />
      {!isReadOnly && (
        <ManageUsersPanel
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          owner={owner}
          mode="editors-only"
          editors={editorsField.value || []}
          onEditorsChange={editorsField.onChange}
          buildersOnly
        />
      )}
    </>
  );
}
