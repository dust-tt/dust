import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useUpdateWorkspaceSandboxAgentEgressRequests } from "@app/lib/swr/sandbox";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SliderToggle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

// Workspace-wide toggle for whether agents can request additional domains
// during a conversation (add_egress_domain). Shown on its own so it stays
// visible regardless of the scope being viewed on the Computer admin page.
export function AgentRequestedDomainsSetting() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const {
    allowAgentEgressRequests,
    updateWorkspaceSandboxAgentEgressRequests,
    isUpdatingWorkspaceSandboxAgentEgressRequests,
  } = useUpdateWorkspaceSandboxAgentEgressRequests({ owner });

  const handleToggle = async () => {
    if (allowAgentEgressRequests) {
      await updateWorkspaceSandboxAgentEgressRequests(false);
      return;
    }
    setIsDialogOpen(true);
  };

  const handleConfirmEnable = async () => {
    const success = await updateWorkspaceSandboxAgentEgressRequests(true);
    if (success) {
      setIsDialogOpen(false);
    }
  };

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDialogOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Allow agents to request additional domains?</Trans>
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Trans>
              When enabled, any agent running in the Computer can ask the user
              to allow additional domains during the conversation. Each request
              is approval-gated, but a non-admin user in this workspace can
              grant network access to a domain you have not pre-approved.
              Domains added this way last only for the current Computer.
            </Trans>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Cancel`,
              variant: "outline",
              onClick: () => setIsDialogOpen(false),
            }}
            rightButtonProps={{
              label: t`Enable`,
              onClick: () => {
                void handleConfirmEnable();
              },
              isLoading: isUpdatingWorkspaceSandboxAgentEgressRequests,
            }}
          />
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between gap-4 border-y border-border py-4">
        <div className="flex min-w-0 flex-col">
          <div className="heading-xl text-foreground">
            <Trans>Agent-requested domains</Trans>
          </div>
          <div className="text-sm text-muted-foreground">
            <Trans>
              Applies to every Computer in this workspace, across all Pods.
              Allow agents to ask for additional domains, one approval per
              domain, during the conversation. When disabled, agents cannot
              request new domains and rely only on the allowed domains
              configured per scope below.
            </Trans>
          </div>
        </div>
        <SliderToggle
          selected={allowAgentEgressRequests}
          onClick={() => {
            void handleToggle();
          }}
          disabled={isUpdatingWorkspaceSandboxAgentEgressRequests}
        />
      </div>
    </>
  );
}
