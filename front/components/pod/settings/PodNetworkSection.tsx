import { EgressDomainListEditor } from "@app/components/sandbox/EgressDomainListEditor";
import {
  usePodEgressPolicy,
  useUpdatePodEgressPolicy,
} from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, InfoCircle, Spinner } from "@dust-tt/sparkle";

interface PodNetworkSectionProps {
  owner: LightWorkspaceType;
  podId: string;
}

// Pod-level sandbox egress allowlist. Merged on top of the workspace-level
// allowlist for the Pod's Shared Computer. Workspace-admin only (matching the
// API), gated behind the `sandbox_functions` feature at the call site.
export function PodNetworkSection({ owner, podId }: PodNetworkSectionProps) {
  const { policy, isPodEgressPolicyLoading, isPodEgressPolicyError } =
    usePodEgressPolicy({ owner, podId });
  const { updatePodEgressPolicy, isUpdatingPodEgressPolicy } =
    useUpdatePodEgressPolicy({ owner, podId });

  if (isPodEgressPolicyLoading) {
    return <Spinner />;
  }
  if (isPodEgressPolicyError) {
    return (
      <ContentMessage
        variant="warning"
        icon={InfoCircle}
        size="lg"
        title="Failed to load"
      >
        The Pod network settings could not be loaded.
      </ContentMessage>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="heading-lg">Network</div>
      <p className="text-sm text-muted-foreground">
        This Pod's Computer can reach these domains on top of the workspace
        allowlist. Changes apply to running Computers within about a minute.
      </p>

      <EgressDomainListEditor
        allowedDomains={policy.allowedDomains}
        onSave={(allowedDomains) => updatePodEgressPolicy({ allowedDomains })}
        isUpdating={isUpdatingPodEgressPolicy}
        emptyMessage="No Pod-specific domains are currently allowed."
      />
    </div>
  );
}
