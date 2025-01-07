import {
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
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
  agentConfiguration: LightAgentConfigurationType;
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
    agentConfigurationId: agentConfiguration.sId,
    disabled: !isOpen,
    workspaceId: owner.sId,
  });

  const doDelete = useDeleteAgentConfiguration({ owner, agentConfiguration });

  return (
    <NewDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <NewDialogContent size="md" isAlertDialog>
        <NewDialogHeader hideButton>
          <NewDialogTitle>Deleting the assistant</NewDialogTitle>
          <NewDialogDescription>
            {isPrivateAssistant ? (
              "Deleting the assistant will be permanent."
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
                This will permanently delete the assistant for everyone.
              </div>
            )}
          </NewDialogDescription>
        </NewDialogHeader>
        <NewDialogContainer>
          <div className="font-bold">Are you sure you want to proceed?</div>
        </NewDialogContainer>
        <NewDialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: isPrivateAssistant
              ? "Delete the assistant"
              : "Delete for everyone",
            variant: "warning",
            onClick: async () => {
              await doDelete();
              onClose();
            },
          }}
        />
      </NewDialogContent>
    </NewDialog>
  );
}
