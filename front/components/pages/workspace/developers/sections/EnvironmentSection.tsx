import type { SandboxEnvVarPodOption } from "@app/components/sandbox/SandboxEnvVarFormDialog";
import { SandboxEnvVarsSection } from "@app/components/sandbox/SandboxEnvVarsSection";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { useWorkspace } from "@app/lib/auth/AuthContext";

interface EnvironmentSectionProps {
  // Live Pods the add dialog can target and rows can be overridden in.
  targetablePods?: SandboxEnvVarPodOption[];
}

// Workspace-scoped sandbox env vars for the developers page. The shared
// section handles both scopes; passing no spaceId selects the workspace one.
export function EnvironmentSection({
  targetablePods,
}: EnvironmentSectionProps) {
  const owner = useWorkspace();
  const { canAdministrateComputer } = useComputerAdminAccess();

  return (
    <SandboxEnvVarsSection
      owner={owner}
      targetablePods={targetablePods}
      canEdit={canAdministrateComputer}
    />
  );
}
