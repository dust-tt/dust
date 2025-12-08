import { useController } from "react-hook-form";

import { EditorsSheet } from "@app/components/shared/EditorsSheet";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";

export function SkillEditorsSheet() {
  const { owner } = useSkillBuilderContext();

  const {
    field: { value: editors, onChange },
  } = useController<SkillBuilderFormData, "editors">({
    name: "editors",
  });

  return (
    <EditorsSheet
      owner={owner}
      editors={editors || []}
      onEditorsChange={onChange}
      description="People who can use and edit the skill."
    />
  );
}
