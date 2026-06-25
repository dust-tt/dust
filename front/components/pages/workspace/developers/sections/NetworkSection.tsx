import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import {
  useUpdateWorkspaceEgressPolicy,
  useUpdateWorkspaceSandboxAgentEgressRequests,
  useWorkspaceEgressPolicy,
} from "@app/lib/swr/sandbox";
import { normalizeEgressPolicyDomain } from "@app/types/sandbox/egress_policy";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoCircle,
  Input,
  Page,
  Plus,
  SliderToggle,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

export function NetworkSection() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxAdmin = isComputerFeatureEnabled(featureFlags);
  const [domainInput, setDomainInput] = useState("");
  const [isEnableAgentRequestsDialogOpen, setIsEnableAgentRequestsDialogOpen] =
    useState(false);

  const {
    policy,
    isWorkspaceEgressPolicyLoading,
    isWorkspaceEgressPolicyError,
  } = useWorkspaceEgressPolicy({
    owner,
    disabled: !hasSandboxAdmin || !isAdmin,
  });
  const { updateWorkspaceEgressPolicy, isUpdatingWorkspaceEgressPolicy } =
    useUpdateWorkspaceEgressPolicy({ owner });
  const {
    allowAgentEgressRequests,
    updateWorkspaceSandboxAgentEgressRequests,
    isUpdatingWorkspaceSandboxAgentEgressRequests,
  } = useUpdateWorkspaceSandboxAgentEgressRequests({ owner });

  const hasDomainInput = domainInput.trim().length > 0;
  const domainInputResult = hasDomainInput
    ? normalizeEgressPolicyDomain(domainInput)
    : null;
  const normalizedDomain =
    domainInputResult?.isOk() === true ? domainInputResult.value : null;
  const isDuplicate =
    normalizedDomain !== null &&
    policy.allowedDomains.includes(normalizedDomain);
  const domainInputMessage =
    domainInputResult?.isErr() === true
      ? domainInputResult.error.message
      : isDuplicate
        ? "This domain is already allowed."
        : normalizedDomain
          ? `Will be saved as ${normalizedDomain}.`
          : "Use an exact domain such as api.openai.com or a wildcard such as *.mistral.ai.";
  const isDomainInputInvalid =
    domainInputResult?.isErr() === true || isDuplicate;
  const canAddDomain =
    normalizedDomain !== null &&
    !isDuplicate &&
    !isUpdatingWorkspaceEgressPolicy;

  const saveDomains = async (allowedDomains: string[]) => {
    return updateWorkspaceEgressPolicy({ allowedDomains });
  };

  const handleAddDomain = async () => {
    if (!canAddDomain || normalizedDomain === null) {
      return;
    }

    const success = await saveDomains([
      ...policy.allowedDomains,
      normalizedDomain,
    ]);
    if (success) {
      setDomainInput("");
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    await saveDomains(policy.allowedDomains.filter((d) => d !== domain));
  };

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
    if (!hasSandboxAdmin) {
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

    return (
      <Page.Vertical align="stretch" gap="lg">
        <div className="flex items-center justify-between gap-4 border-y border-border py-4 dark:border-border-night">
          <div className="flex min-w-0 flex-col">
            <div className="heading-sm text-foreground dark:text-foreground-night">
              Agent-requested domains
            </div>
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Allow agents using the Computer to ask for additional domains, one
              approval per domain, during the conversation. When disabled,
              agents cannot request new domains and should only rely on the
              domains listed below.
            </div>
          </div>
          <SliderToggle
            size="xs"
            selected={allowAgentEgressRequests}
            onClick={() => {
              void handleToggleAgentEgressRequests();
            }}
            disabled={isUpdatingWorkspaceSandboxAgentEgressRequests}
          />
        </div>

        <Page.SectionHeader
          title="Allowed domains"
          description="These domains apply to every Computer in this workspace. Changes are picked up by egress proxy cache refreshes, typically within 60 seconds."
        />

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAddDomain();
          }}
        >
          <div className="grow">
            <Input
              label="Domain"
              name="domain"
              placeholder="e.g. api.openai.com or *.mistral.ai"
              value={domainInput}
              message={domainInputMessage}
              messageStatus={isDomainInputInvalid ? "error" : "info"}
              onChange={(event) => setDomainInput(event.target.value)}
              disabled={isUpdatingWorkspaceEgressPolicy}
            />
          </div>
          <Button
            type="submit"
            label="Add domain"
            icon={Plus}
            disabled={!canAddDomain}
            isLoading={isUpdatingWorkspaceEgressPolicy}
            className="mt-0 sm:mt-7"
          />
        </form>

        {policy.allowedDomains.length === 0 ? (
          <ContentMessage variant="outline" size="lg">
            No workspace-specific domains are currently allowed.
          </ContentMessage>
        ) : (
          <div className="flex w-full flex-col divide-y divide-separator dark:divide-separator-night">
            {policy.allowedDomains.map((domain) => (
              <div key={domain} className="flex items-center gap-3 py-3">
                <pre
                  title={domain}
                  className="min-w-0 grow overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground dark:bg-muted-background-night dark:text-foreground-night"
                >
                  {domain}
                </pre>
                <Button
                  variant="warning"
                  size="mini"
                  icon={Trash01}
                  tooltip={`Remove ${domain}`}
                  disabled={isUpdatingWorkspaceEgressPolicy}
                  onClick={() => {
                    void handleRemoveDomain(domain);
                  }}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        )}
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
