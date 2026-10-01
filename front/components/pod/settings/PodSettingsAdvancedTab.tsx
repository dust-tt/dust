import { PodNetworkSection } from "@app/components/pod/settings/PodNetworkSection";
import { SandboxEnvVarsSection } from "@app/components/sandbox/SandboxEnvVarsSection";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { RichSpaceType } from "@app/types/api/spaces";
import { isFramesV2FunctionsEnabled } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType } from "@app/types/user";

interface PodSettingsAdvancedTabProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function PodSettingsAdvancedTab({
  owner,
  pod,
}: PodSettingsAdvancedTabProps) {
  const { featureFlags } = useFeatureFlags();
  const { isAdmin } = useAuth();

  // Env var editing is workspace-admin only (matching the API write gates);
  // the list is visible to anyone who can see the tab, like the network
  // section. Values are write-only, so the list carries names, kinds and
  // domains only.
  const hasFramesV2Functions = isFramesV2FunctionsEnabled(featureFlags);
  const isPodSandboxAdminEnabled = isAdmin && hasFramesV2Functions;
  // The pod network section is visible to anyone who can open this page once
  // the feature is on (the API opens the egress GET to Pod readers); editing
  // stays workspace-admin only. Mirrors the egress-policy route gates — change
  // both together.
  const canViewPodNetwork = hasFramesV2Functions;
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

      <div className="flex w-full flex-col gap-2">
        <SandboxEnvVarsSection
          owner={owner}
          spaceId={pod.sId}
          canEdit={isPodSandboxAdminEnabled}
        />
      </div>
    </>
  );
}
