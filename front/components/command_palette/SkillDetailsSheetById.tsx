import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface SkillDetailsSheetByIdProps {
  owner: LightWorkspaceType;
  user: UserType;
  skillId: string | null;
  onClose: () => void;
}

export function SkillDetailsSheetById({
  owner,
  user,
  skillId,
  onClose,
}: SkillDetailsSheetByIdProps) {
  const { skill, isSkillError, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
    disabled: !skillId,
  });

  return (
    <SkillDetailsSheet
      skill={skill ?? null}
      open={skillId !== null}
      isError={isSkillError}
      onRetry={mutateSkill}
      owner={owner}
      user={user}
      onClose={onClose}
    />
  );
}
