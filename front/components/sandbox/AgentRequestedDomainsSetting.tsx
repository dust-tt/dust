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
import { useState } from "react";

// Workspace-wide toggle for whether agents can request additional domains
// during a conversation (add_egress_domain). Shown on its own so it stays
// visible regardless of the scope being viewed on the Computer admin page.
export function AgentRequestedDomainsSetting() {
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
              onClick: () => setIsDialogOpen(false),
            }}
            rightButtonProps={{
              label: "Enable",
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
          <div className="heading-sm text-foreground">
            Agent-requested domains
          </div>
          <div className="text-sm text-muted-foreground">
            Allow agents using the Computer to ask for additional domains, one
            approval per domain, during the conversation. When disabled, agents
            cannot request new domains and should only rely on the domains
            listed below.
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
