import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

import { useRestoreAgentConfiguration } from "@app/lib/swr/assistants";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

interface RestoreAssistantDialogProps {
  agentConfiguration?: LightAgentConfigurationType;
  isOpen: boolean;
  isPrivateAssistant?: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function RestoreAssistantDialog({
  agentConfiguration,
  isOpen,
  onClose,
  owner,
}: RestoreAssistantDialogProps) {
  const doRestore = useRestoreAgentConfiguration({ owner, agentConfiguration });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>Restoring the agent</DialogTitle>
          <DialogDescription>
            This will restore the agent for everyone.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">Are you sure you want to proceed?</div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Restore the agent",
            variant: "warning",
            onClick: async () => {
              await doRestore();
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
