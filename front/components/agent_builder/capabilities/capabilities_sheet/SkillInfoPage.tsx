import {
  SkillDetailsContent,
  SkillDetailsHeader,
  SkillLoadError,
} from "@app/components/skills/SkillDetailsBody";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

interface SkillInfoPageProps {
  skillId: string;
  owner: WorkspaceType;
  user: UserType;
  onClose: () => void;
}

export function SkillInfoPage({
  skillId,
  owner,
  user,
  onClose,
}: SkillInfoPageProps) {
  const { skill, isSkillError, isSkillNotFound, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
  });

  if (isSkillError) {
    return (
      <SkillLoadError
        reason={isSkillNotFound ? "not_found" : "unavailable"}
        onRetry={mutateSkill}
      />
    );
  }

  if (!skill) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SkillDetailsHeader skill={skill} owner={owner} onClose={onClose} />
      <SkillDetailsContent skill={skill} owner={owner} user={user} />
    </div>
  );
}
