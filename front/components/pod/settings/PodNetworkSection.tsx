import { EgressDomainListEditor } from "@app/components/sandbox/EgressDomainListEditor";
import {
  useDismissPodEgressRequest,
  usePodEgressPolicy,
  useUpdatePodEgressPolicy,
} from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, InfoCircle, Spinner } from "@dust-tt/sparkle";

interface PodNetworkSectionProps {
  owner: LightWorkspaceType;
  podId: string;
  // Pod members can view; only workspace admins can edit (matching the API).
  canEdit: boolean;
}

// Pod-level sandbox egress allowlist. Merged on top of the workspace-level
// allowlist for the Pod's Shared Computer. Visible to anyone who can open the
// Pod settings page; editable only by workspace admins.
export function PodNetworkSection({
  owner,
  podId,
  canEdit,
}: PodNetworkSectionProps) {
  const {
    policy,
    requestedDomains,
    isPodEgressPolicyLoading,
    isPodEgressPolicyError,
  } = usePodEgressPolicy({ owner, podId });
  const { updatePodEgressPolicy, isUpdatingPodEgressPolicy } =
    useUpdatePodEgressPolicy({ owner, podId });
  const { dismissPodEgressRequest, isDismissingRequest } =
    useDismissPodEgressRequest({ owner, podId });

  if (isPodEgressPolicyLoading) {
    return <Spinner />;
  }
  const allowedDomainSet = new Set(policy.allowedDomains);

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
        pendingRequests={requestedDomains.filter(
          (request) => !allowedDomainSet.has(request.domain)
        )}
        onApproveRequest={(domain) =>
          updatePodEgressPolicy({
            allowedDomains: [...new Set([...policy.allowedDomains, domain])],
          })
        }
        onRejectRequest={(domain) => dismissPodEgressRequest(domain)}
        onSave={(allowedDomains) => updatePodEgressPolicy({ allowedDomains })}
        isUpdating={isUpdatingPodEgressPolicy || isDismissingRequest}
        emptyMessage="No Pod-specific domains are currently allowed."
        readOnly={!canEdit}
      />
    </div>
  );
}
