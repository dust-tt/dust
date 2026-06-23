import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { Button, Users01 } from "@dust-tt/sparkle";
import { useState } from "react";
import { useController } from "react-hook-form";

interface SkillEditorsSheetProps {
  disabled?: boolean;
}

export function SkillEditorsSheet({
  disabled = false,
}: SkillEditorsSheetProps) {
  const { owner } = useSkillBuilderContext();
  const [isOpen, setIsOpen] = useState(false);

  const {
    field: { value: editors, onChange },
  } = useController<SkillBuilderFormData, "editors">({
    name: "editors",
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        icon={Users01}
        label="Editors"
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
          }
        }}
        disabled={disabled}
        type="button"
      />
      <ManageUsersPanel
        isOpen={isOpen && !disabled}
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
