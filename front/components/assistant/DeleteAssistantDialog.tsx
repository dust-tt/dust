import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import {
  useAgentUsage,
  useDeleteAgentConfiguration,
} from "@app/lib/swr/assistants";

interface DeleteAssistantDialogProps {
  agentConfiguration?: LightAgentConfigurationType;
  isOpen: boolean;
  isPrivateAssistant?: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function DeleteAssistantDialog({
  agentConfiguration,
  isOpen,
  isPrivateAssistant,
  onClose,
  owner,
}: DeleteAssistantDialogProps) {
  const agentUsage = useAgentUsage({
    agentConfigurationId: agentConfiguration?.sId ?? null,
    disabled: !isOpen,
    workspaceId: owner.sId,
  });

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
          <DialogTitle>Deleting the agent</DialogTitle>
          <DialogDescription>
            {isPrivateAssistant ? (
              "Deleting the agent will be permanent."
            ) : (
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
                This will permanently delete the agent for everyone.
              </div>
            )}
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
            label: isPrivateAssistant
              ? "Delete the agent"
              : "Delete for everyone",
            variant: "warning",
            onClick: async () => {
              await doDelete();
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
