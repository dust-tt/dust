import Custom404 from "@app/components/pages/Custom404";
import SkillBuilder from "@app/components/skill_builder/SkillBuilder";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useLingui } from "@lingui/react/macro";

export function CreateSkillPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { user } = useAuth();
  const { hasPermission } = useWorkspacePermissions();

  useDocumentTitle(t`Dust - New skill`);

  if (!hasPermission("create", "skill")) {
    return <Custom404 />;
  }

  return (
    <SkillBuilderProvider owner={owner} user={user} skillId={null}>
      <SkillBuilder onSaved={() => undefined} />
    </SkillBuilderProvider>
  );
}
