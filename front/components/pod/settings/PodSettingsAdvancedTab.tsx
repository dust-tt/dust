import { PodNetworkSection } from "@app/components/pod/settings/PodNetworkSection";
import { SandboxEnvVarsSection } from "@app/components/sandbox/SandboxEnvVarsSection";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
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
  const { hasFeature } = useFeatureFlags();
  const { isAdmin } = useAuth();

  // The pod env vars section stays workspace-admin only (matching the API,
  // which keeps env-vars admin-only). Mirrors that gate — change both together.
  const isPodSandboxAdminEnabled = isAdmin && hasFeature("frames_v2");
  // The pod network section is visible to anyone who can open this page once
  // the feature is on (the API opens the egress GET to Pod readers); editing
  // stays workspace-admin only. Mirrors the egress-policy route gates — change
  // both together.
  const canViewPodNetwork = hasFeature("frames_v2");
  const canEditPodNetwork = isPodSandboxAdminEnabled;

  return (
    <>
      {canViewPodNetwork && (
        <PodNetworkSection
          owner={owner}
          podId={pod.sId}
          canEdit={canEditPodNetwork}
        />
      )}

      {isPodSandboxAdminEnabled && (
        <div className="flex w-full flex-col gap-2">
          <SandboxEnvVarsSection owner={owner} spaceId={pod.sId} />
        </div>
      )}
    </>
  );
}
