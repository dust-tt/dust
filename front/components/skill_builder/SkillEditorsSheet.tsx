import { useController } from "react-hook-form";

import { EditorsSheetBase } from "@app/components/shared/EditorsSheet";
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
    <EditorsSheetBase
      owner={owner}
      editors={editors || []}
      onChangeEditors={onChange}
      description="People who can use and edit the skill."
    />
  );
}
