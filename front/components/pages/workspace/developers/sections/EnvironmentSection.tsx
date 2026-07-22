import { SandboxEnvVarsSection } from "@app/components/sandbox/SandboxEnvVarsSection";
import { useWorkspace } from "@app/lib/auth/AuthContext";

// Workspace-scoped sandbox env vars for the developers page. The shared
// section handles both scopes; passing no spaceId selects the workspace one.
export function EnvironmentSection() {
  const owner = useWorkspace();

  return <SandboxEnvVarsSection owner={owner} />;
}
