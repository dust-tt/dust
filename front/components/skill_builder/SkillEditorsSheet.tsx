import { ManageUsersPanel } from "@app/components/assistant/conversation/space/ManageUsersPanel";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { Button, UserGroupIcon } from "@dust-tt/sparkle";
import { useState } from "react";
import { useController } from "react-hook-form";

export function SkillEditorsSheet() {
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
        icon={UserGroupIcon}
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
