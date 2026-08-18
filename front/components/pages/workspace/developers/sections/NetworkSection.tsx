import { EgressDomainListEditor } from "@app/components/sandbox/EgressDomainListEditor";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  useDismissWorkspaceEgressRequest,
  useUpdateWorkspaceEgressPolicy,
  useWorkspaceEgressPolicy,
} from "@app/lib/swr/sandbox";
import { ContentMessage, InfoCircle, Page, Spinner } from "@dust-tt/sparkle";

export function NetworkSection() {
  const owner = useWorkspace();
  const { isAdmin, isComputerEnabled, canAdministrateComputer } =
    useComputerAdminAccess();

  const {
    policy,
    requestedDomains,
    isWorkspaceEgressPolicyLoading,
    isWorkspaceEgressPolicyError,
  } = useWorkspaceEgressPolicy({
    owner,
    disabled: !canAdministrateComputer,
  });
  const { updateWorkspaceEgressPolicy, isUpdatingWorkspaceEgressPolicy } =
    useUpdateWorkspaceEgressPolicy({ owner });
  const { dismissWorkspaceEgressRequest, isDismissingRequest } =
    useDismissWorkspaceEgressRequest({ owner });

  if (!isAdmin) {
    return (
      <ContentMessage variant="info" icon={InfoCircle} size="lg">
        Only workspace admins can manage Computer network settings.
      </ContentMessage>
    );
  }
  if (!isComputerEnabled) {
    return (
      <ContentMessage variant="info" icon={InfoCircle} size="lg">
        Computer administration is not enabled for this workspace.
      </ContentMessage>
    );
  }
  if (isWorkspaceEgressPolicyLoading) {
    return <Spinner />;
  }
  if (isWorkspaceEgressPolicyError) {
    return (
      <ContentMessage
        variant="warning"
        icon={InfoCircle}
        size="lg"
        title="Failed to load"
      >
        The Computer network settings could not be loaded.
      </ContentMessage>
    );
  }

  const allowedDomainSet = new Set(policy.allowedDomains);

  return (
    <Page.Vertical align="stretch" gap="lg">
      <Page.SectionHeader
        title="Allowed domains"
        description="These domains apply to every Computer in this workspace. Hostnames are matched exactly. To allow both example.com and www.example.com, add each separately. A wildcard such as *.example.com allows subdomains, but not example.com itself. Changes are picked up by egress proxy cache refreshes, typically within 60 seconds."
      />

      <EgressDomainListEditor
        allowedDomains={policy.allowedDomains}
        pendingRequests={requestedDomains.filter(
          (request) => !allowedDomainSet.has(request.domain)
        )}
        onApproveRequest={(domain) =>
          updateWorkspaceEgressPolicy({
            allowedDomains: [...new Set([...policy.allowedDomains, domain])],
          })
        }
        onRejectRequest={(domain) => dismissWorkspaceEgressRequest(domain)}
        onSave={(allowedDomains) =>
          updateWorkspaceEgressPolicy({ allowedDomains })
        }
        isUpdating={isUpdatingWorkspaceEgressPolicy || isDismissingRequest}
        emptyMessage="No workspace-specific domains are currently allowed."
      />
    </Page.Vertical>
  );
}
