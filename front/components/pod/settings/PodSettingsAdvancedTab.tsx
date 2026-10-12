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

  // Env var editing is workspace-admin only (matching the API write gates);
  // the list is visible to anyone who can see the tab, like the network
  // section. Values are write-only, so the list carries names, kinds and
  // domains only.
  // The pod network section is visible to anyone who can open this page (the
  // API opens the egress GET to Pod readers); editing is workspace-admin only.
  // Mirrors the egress-policy route gates — change both together.
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
