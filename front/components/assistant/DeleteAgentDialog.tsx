import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import {
  useAgentUsage,
  useDeleteAgentConfiguration,
} from "@app/lib/swr/assistants";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

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
          <DialogTitle>Archiving the agent</DialogTitle>
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
              This will archive the agent for everyone.
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">Are you sure you want to proceed?</div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isDeleting,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Archive for everyone",
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
