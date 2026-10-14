import { PodNetworkSection } from "@app/components/pod/settings/PodNetworkSection";
import { SandboxEnvVarsSection } from "@app/components/sandbox/SandboxEnvVarsSection";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { LightWorkspaceType } from "@app/types/user";

interface PodSettingsAdvancedTabProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function PodSettingsAdvancedTab({
  owner,
  pod,
}: PodSettingsAdvancedTabProps) {
  const { isAdmin } = useAuth();

  // Editing is workspace-admin only, mirroring the egress-policy and env-vars
  // route gates — change both together.
  return (
    <>
      <PodNetworkSection owner={owner} podId={pod.sId} canEdit={isAdmin} />

      <div className="flex w-full flex-col gap-2">
        <SandboxEnvVarsSection
          owner={owner}
          spaceId={pod.sId}
          canEdit={isAdmin}
        />
      </div>
    </>
  );
}
