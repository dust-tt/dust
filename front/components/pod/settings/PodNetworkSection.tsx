import { EgressDomainListEditor } from "@app/components/sandbox/EgressDomainListEditor";
import {
  useDismissPodEgressRequest,
  usePodEgressPolicy,
  useRequestPodEgressDomain,
  useUpdatePodEgressPolicy,
} from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, InfoCircle, Spinner } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface PodNetworkSectionProps {
  owner: LightWorkspaceType;
  podId: string;
  // Pod members can view; only workspace admins can edit (matching the API).
  canEdit: boolean;
}

// Pod-level sandbox egress allowlist. Merged on top of the workspace-level
// allowlist for every Computer that runs in the Pod. Visible to anyone who can
// open the Pod settings page; editable only by workspace admins.
export function PodNetworkSection({
  owner,
  podId,
  canEdit,
}: PodNetworkSectionProps) {
  const { t } = useLingui();
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
  const { requestPodEgressDomain, isRequestingPodEgressDomain } =
    useRequestPodEgressDomain({ owner, podId });

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
        title={t`Failed to load`}
      >
        <Trans>The Pod network settings could not be loaded.</Trans>
      </ContentMessage>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="heading-lg">
        <Trans>Network</Trans>
      </div>
      <p className="text-sm text-muted-foreground">
        <Trans>
          Computers in this Pod can reach the following domains, in addition to
          the workspace allowlist. Changes apply to every Computer running in
          the Pod within about a minute.
        </Trans>
        {!canEdit && (
          <>
            {" "}
            <Trans>
              You can request additional domains; a workspace admin reviews each
              request.
            </Trans>
          </>
        )}
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
        isUpdating={
          isUpdatingPodEgressPolicy ||
          isDismissingRequest ||
          isRequestingPodEgressDomain
        }
        emptyMessage={t`No Pod-specific domains are currently allowed.`}
        readOnly={!canEdit}
        onRequestDomain={
          canEdit ? undefined : (domain) => requestPodEgressDomain(domain)
        }
      />
    </div>
  );
}
