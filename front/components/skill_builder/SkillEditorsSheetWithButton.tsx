import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { BecomeEditorButton } from "@app/components/shared/BecomeEditorButton";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/skillBuilderFormSchema";
import { Button, Users01 } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useController } from "react-hook-form";

interface SkillEditorsSheetWithButtonProps {
  isEditorGateVisible: boolean;
  isAddingSelfAsEditor: boolean;
  onAddSelfAsEditor: () => void;
}

export function SkillEditorsSheetWithButton({
  isEditorGateVisible,
  isAddingSelfAsEditor,
  onAddSelfAsEditor,
}: SkillEditorsSheetWithButtonProps) {
  const { t } = useLingui();
  const { owner } = useSkillBuilderContext();
  const [isOpen, setIsOpen] = useState(false);

  const {
    field: { value: editors, onChange, disabled },
  } = useController<SkillBuilderFormData, "editors">({
    name: "editors",
  });
  const isReadOnly = disabled ?? false;

  if (isEditorGateVisible) {
    return (
      <BecomeEditorButton
        isLoading={isAddingSelfAsEditor}
        onClick={onAddSelfAsEditor}
      />
    );
  }

  const editorsCount = editors.length;
  const buttonLabel =
    editorsCount <= 1
      ? t`Add editors`
      : t`${plural(editorsCount, { one: "# editor", other: "# editors" })}`;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        icon={Users01}
        label={buttonLabel}
        disabled={isReadOnly}
        onClick={() => setIsOpen(true)}
        type="button"
      />
      <ManageUsersPanel
        isOpen={isOpen && !isReadOnly}
        setIsOpen={setIsOpen}
        owner={owner}
        mode="editors-only"
        editors={editors || []}
        onEditorsChange={onChange}
      />
    </>
  );
}
