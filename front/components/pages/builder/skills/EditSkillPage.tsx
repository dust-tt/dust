import { Spinner } from "@dust-tt/sparkle";

import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { Head, useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { useSkill } from "@app/lib/swr/skill_configurations";

export function EditSkillPage() {
  const router = useAppRouter();
  const owner = useWorkspace();
  const { user } = useAuth();
  const skillId = useRequiredPathParam("sId");

  const { skill, isSkillLoading, isSkillError } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
  });

  const isNotFound =
    isSkillError ||
    (!isSkillLoading && !skill) ||
    (skill && (!skill.canWrite || skill.status === "archived"));

  if (isNotFound) {
    void router.replace("/404");
  }

  if (isNotFound || isSkillLoading || !skill) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <SkillBuilderProvider owner={owner} user={user} skillId={skill.sId}>
      <Head>
        <title>{`Dust - ${skill.name}`}</title>
      </Head>
      <SkillBuilder
        skill={skill}
        extendedSkill={skill.relations?.extendedSkill ?? undefined}
      />
    </SkillBuilderProvider>
  );
}
