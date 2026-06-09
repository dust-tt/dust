import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";

export function CreateSkillPage() {
  const owner = useWorkspace();
  const { user } = useAuth();

  useDocumentTitle("Dust - New Skill");

  return (
    <SkillBuilderProvider owner={owner} user={user} skillId={null}>
      <SkillBuilder onSaved={() => undefined} />
    </SkillBuilderProvider>
  );
}
