import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSearchParam } from "@app/lib/platform";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { Spinner } from "@dust-tt/sparkle";

export function CreateSkillPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const extendsParam = useSearchParam("extends");

  const {
    skill: extendedSkillData,
    isSkillLoading: isExtendedSkillLoading,
    mutateSkill,
  } = useSkill({
    workspaceId: owner.sId,
    skillId: extendsParam,
    disabled: !extendsParam,
  });

  useDocumentTitle("Dust - New Skill");

  if (extendsParam && isExtendedSkillLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  const extendedSkill = extendedSkillData?.isExtendable
    ? extendedSkillData
    : null;

  return (
    <SkillBuilderProvider owner={owner} user={user} skillId={null}>
      <SkillBuilder
        extendedSkill={extendedSkill ?? undefined}
        onSaved={mutateSkill}
      />
    </SkillBuilderProvider>
  );
}
