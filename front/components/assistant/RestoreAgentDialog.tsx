import { useRestoreAgentConfiguration } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface RestoreAssistantDialogProps {
  agentConfiguration?: LightAgentConfigurationType;
  isOpen: boolean;
  isPrivateAssistant?: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function RestoreAgentDialog({
  agentConfiguration,
  isOpen,
  onClose,
  owner,
}: RestoreAssistantDialogProps) {
  const { t } = useLingui();
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
          <DialogTitle>
            <Trans>Restoring the agent</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>This will restore the agent for everyone.</Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">
            <Trans>Are you sure you want to proceed?</Trans>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Restore the agent`,
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
