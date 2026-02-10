import { Spinner } from "@dust-tt/sparkle";

import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { Head, useRequiredPathParam } from "@app/lib/platform";
import { useSkill } from "@app/lib/swr/skill_configurations";
import Custom404 from "@app/pages/404";

export function EditSkillPage() {
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
    return <Custom404 />;
  }

  if (isSkillLoading || !skill) {
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
