import { Dialog } from "@dust-tt/sparkle";
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
  const doDelete = useDeleteAgentConfiguration({ owner, agentConfiguration });

  const agentUsage = useAgentUsage({
    agentConfigurationId: agentConfiguration.sId,
    disabled: !isOpen,
    workspaceId: owner.sId,
  });

  return (
    <Dialog
      isOpen={isOpen}
      title="Deleting the assistant"
      onCancel={onClose}
      validateLabel={
        isPrivateAssistant ? "Delete the assistant" : "Delete for everyone"
      }
      validateVariant="primaryWarning"
      onValidate={async () => {
        await doDelete();
        onClose();
      }}
      alertDialog
    >
      <div className="flex flex-col gap-2">
        <div>
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
        </div>
        <div className="font-bold">Are you sure you want to proceed?</div>
      </div>
    </Dialog>
  );
}
