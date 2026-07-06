import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { useBuilderEditorGate } from "@app/components/shared/BuilderEditorGateContext";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { Button, Users01, UsersPlus } from "@dust-tt/sparkle";
import { useState } from "react";
import { useController } from "react-hook-form";

export function SkillEditorsSheet() {
  const { owner } = useSkillBuilderContext();
  const [isOpen, setIsOpen] = useState(false);
  const { isEditorGateVisible, isAddingSelfAsEditor, onAddSelfAsEditor } =
    useBuilderEditorGate();

  const {
    field: { value: editors, onChange },
  } = useController<SkillBuilderFormData, "editors">({
    name: "editors",
  });

  if (isEditorGateVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        icon={UsersPlus}
        label={
          isAddingSelfAsEditor ? "Becoming an editor..." : "Become an editor"
        }
        isLoading={isAddingSelfAsEditor}
        disabled={isAddingSelfAsEditor}
        onClick={() => {
          void onAddSelfAsEditor();
        }}
        type="button"
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
        onClick={() => setIsOpen(true)}
        type="button"
      />
      <ManageUsersPanel
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        owner={owner}
        mode="editors-only"
        editors={editors || []}
        onEditorsChange={onChange}
        buildersOnly
      />
    </>
  );
}
