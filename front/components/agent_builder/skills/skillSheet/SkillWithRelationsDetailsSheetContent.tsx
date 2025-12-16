import React from "react";

import { SkillDetailsSheetContent } from "@app/components/skills/SkillDetailsSheet";
import { useSkillWithRelations } from "@app/lib/swr/skill_configurations";
import type { UserType, WorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

type SkillWithRelationsDetailsSheetContentProps = {
  owner: WorkspaceType;
  user: UserType;
  skill: SkillType;
};

export function SkillWithRelationsDetailsSheetContent({
  owner,
  user,
  skill,
}: SkillWithRelationsDetailsSheetContentProps) {
  const { skillWithRelations } = useSkillWithRelations({
    owner,
    id: skill.sId,
  });

  return (
    <SkillDetailsSheetContent
      skill={skillWithRelations ?? skill}
      owner={owner}
      user={user}
    />
  );
}
