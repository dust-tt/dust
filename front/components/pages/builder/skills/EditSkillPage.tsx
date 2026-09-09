import Custom404 from "@app/components/pages/Custom404";
import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { RedactedSkillMessage } from "@app/components/skills/RedactedSkillMessage";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { Spinner } from "@dust-tt/sparkle";

export function EditSkillPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const skillId = useRequiredPathParam("sId");

  const { skill, isSkillLoading, isSkillError, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
  });

  useDocumentTitle(skill ? `Dust - ${skill.name}` : "Dust - Skill");

  const isNotFound =
    isSkillError ||
    (!isSkillLoading && !skill) ||
    (skill && (!skill.canAdministrate || skill.status === "archived"));

  if (isNotFound) {
    return <Custom404 />;
  }

  if (isSkillLoading || !skill) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const builder = (
    <SkillBuilderProvider
      key={skill.sId}
      owner={owner}
      user={user}
      skillId={skill.sId}
    >
      <SkillBuilder skill={skill} onSaved={mutateSkill} />
    </SkillBuilderProvider>
  );

  // The API redacts the private fields of the skills an admin cannot read (`canRead` false): the
  // builder would show empty guidelines. Keep it as a blurred, inert backdrop and show the details
  // panel's message and actions on top. Once access is granted, the refetch lifts the overlay.
  if (!skill.canRead) {
    return (
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none select-none blur-sm"
        >
          {builder}
        </div>
        <div className="absolute inset-0 z-10 flex items-start justify-center p-8">
          <div className="w-full max-w-2xl">
            <RedactedSkillMessage skill={skill} owner={owner} />
          </div>
        </div>
      </div>
    );
  }

  return builder;
}
