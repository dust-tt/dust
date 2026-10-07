import { assistantUsageMessage } from "@app/components/assistant/Usage";
import {
  useAgentUsage,
  useDeleteAgentConfiguration,
} from "@app/lib/swr/assistants";
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
import { useState } from "react";

interface DeleteAssistantDialogProps {
  agentConfiguration?: LightAgentConfigurationType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function DeleteAgentDialog({
  agentConfiguration,
  isOpen,
  onClose,
  owner,
}: DeleteAssistantDialogProps) {
  const { t } = useLingui();
  const agentUsage = useAgentUsage({
    agentConfigurationId: agentConfiguration?.sId ?? null,
    disabled: !isOpen,
    workspaceId: owner.sId,
  });

  const [isDeleting, setIsDeleting] = useState(false);
  const doDelete = useDeleteAgentConfiguration({ owner, agentConfiguration });

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
            <Trans>Archiving the agent</Trans>
          </DialogTitle>
          <DialogDescription>
            <div>
              <span className="font-bold">
                {agentUsage &&
                  assistantUsageMessage({
                    usage: agentUsage.agentUsage,
                    isError: agentUsage.isAgentUsageError,
                    isLoading: agentUsage.isAgentUsageLoading,
                    assistantName: agentConfiguration?.name ?? "",
                  })}
              </span>{" "}
              <Trans>This will archive the agent for everyone.</Trans>
            </div>
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
            disabled: isDeleting,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Archive for everyone`,
            disabled: isDeleting,
            variant: "warning",
            onClick: async (e: React.MouseEvent) => {
              e.preventDefault();
              setIsDeleting(true);
              await doDelete();
              setIsDeleting(false);
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
