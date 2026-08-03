import Custom404 from "@app/components/pages/Custom404";
import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";

export function CreateSkillPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const { hasPermission } = useWorkspacePermissions();

  useDocumentTitle("Dust - New Skill");

  if (!hasPermission("create", "skill")) {
    return <Custom404 />;
  }

  return (
    <SkillBuilderProvider owner={owner} user={user} skillId={null}>
      <SkillBuilder onSaved={() => undefined} />
    </SkillBuilderProvider>
  );
}
