import { EgressDomainListEditor } from "@app/components/sandbox/EgressDomainListEditor";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  useDismissWorkspaceEgressRequest,
  useUpdateWorkspaceEgressPolicy,
  useUpdateWorkspaceSandboxAgentEgressRequests,
  useWorkspaceEgressPolicy,
} from "@app/lib/swr/sandbox";
import {
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoCircle,
  Page,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

export function NetworkSection() {
  const owner = useWorkspace();
  const { isAdmin, isComputerEnabled, canAdministrateComputer } =
    useComputerAdminAccess();
  const [isEnableAgentRequestsDialogOpen, setIsEnableAgentRequestsDialogOpen] =
    useState(false);

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
  const {
    allowAgentEgressRequests,
    updateWorkspaceSandboxAgentEgressRequests,
    isUpdatingWorkspaceSandboxAgentEgressRequests,
  } = useUpdateWorkspaceSandboxAgentEgressRequests({ owner });

  const handleToggleAgentEgressRequests = async () => {
    if (allowAgentEgressRequests) {
      await updateWorkspaceSandboxAgentEgressRequests(false);
      return;
    }

    setIsEnableAgentRequestsDialogOpen(true);
  };

  const handleConfirmEnableAgentEgressRequests = async () => {
    const success = await updateWorkspaceSandboxAgentEgressRequests(true);
    if (success) {
      setIsEnableAgentRequestsDialogOpen(false);
    }
  };

  const renderBody = () => {
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
        <div className="flex items-center justify-between gap-4 border-y border-border py-4">
          <div className="flex min-w-0 flex-col">
            <div className="heading-sm text-foreground">
              Agent-requested domains
            </div>
            <div className="text-sm text-muted-foreground">
              Allow agents using the Computer to ask for additional domains, one
              approval per domain, during the conversation. When disabled,
              agents cannot request new domains and should only rely on the
              domains listed below.
            </div>
          </div>
          <SliderToggle
            selected={allowAgentEgressRequests}
            onClick={() => {
              void handleToggleAgentEgressRequests();
            }}
            disabled={isUpdatingWorkspaceSandboxAgentEgressRequests}
          />
        </div>

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
  };

  return (
    <>
      <Dialog
        open={isEnableAgentRequestsDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEnableAgentRequestsDialogOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Allow agents to request additional domains?
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            When enabled, any agent running in the Computer can ask the user to
            allow additional domains during the conversation. Each request is
            approval-gated, but a non-admin user in this workspace can grant
            network access to a domain you have not pre-approved. Domains added
            this way last only for the current Computer.
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setIsEnableAgentRequestsDialogOpen(false),
            }}
            rightButtonProps={{
              label: "Enable",
              onClick: () => {
                void handleConfirmEnableAgentEgressRequests();
              },
              isLoading: isUpdatingWorkspaceSandboxAgentEgressRequests,
            }}
          />
        </DialogContent>
      </Dialog>

      {renderBody()}
    </>
  );
}
