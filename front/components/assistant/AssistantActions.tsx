import { Dialog } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { useContext } from "react";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { updateAgentUserListStatus } from "@app/lib/client/dust_api";
import { useAgentConfiguration, useAgentUsage } from "@app/lib/swr";

export function DeleteAssistantDialog({
  owner,
  agentConfigurationId,
  show,
  onClose,
  onDelete,
  isPrivateAssistant,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string;
  show: boolean;
  onClose: () => void;
  onDelete: () => void;
  isPrivateAssistant?: boolean;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId,
  });
  const agentUsage = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId,
  });
  return (
    <Dialog
      isOpen={show}
      title={`Deleting the assistant`}
      onCancel={onClose}
      validateLabel={
        isPrivateAssistant ? "Delete the assistant" : "Delete for everyone"
      }
      validateVariant="primaryWarning"
      onValidate={async () => {
        try {
          const res = await fetch(
            `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}`,
            {
              method: "DELETE",
            }
          );
          if (!res.ok) {
            const data = await res.json();
            sendNotification({
              title: "Error deleting Assistant",
              description: data.error.message,
              type: "error",
            });
          } else {
            sendNotification({
              title: "Assistant deleted",
              type: "success",
            });
            onDelete();
          }
        } catch (e) {
          sendNotification({
            title: "Error deleting Assistant",
            description: (e as Error).message,
            type: "error",
          });
        }

        onClose();
      }}
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

export function RemoveAssistantFromListDialog({
  owner,
  agentConfiguration,
  show,
  onClose,
  onRemove,
}: {
  owner: WorkspaceType;
  agentConfiguration: LightAgentConfigurationType;
  show: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  return (
    <Dialog
      isOpen={show}
      title={`Remove from my list`}
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="primaryWarning"
      onValidate={async () => {
        const { errorMessage, success } = await updateAgentUserListStatus({
          listStatus: "not-in-list",
          owner,
          agentConfigurationId: agentConfiguration.sId,
        });

        if (success) {
          sendNotification({
            title: `Assistant removed from your list`,
            type: "success",
          });
          onRemove();
        } else {
          sendNotification({
            title: `Error removing Assistant`,
            description: errorMessage,
            type: "error",
          });
        }

        onClose();
      }}
    >
      <div>
        This will remove the assistant from your list. You can add it back to
        your list at any time from the Chat homepage.
      </div>
    </Dialog>
  );
}

export function RemoveAssistantFromWorkspaceDialog({
  owner,
  agentConfiguration,
  show,
  onClose,
  onRemove,
}: {
  owner: WorkspaceType;
  agentConfiguration: LightAgentConfigurationType;
  show: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  const { agentConfiguration: detailedConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });

  return (
    <Dialog
      isOpen={show}
      title={`Remove from Company assistants`}
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="primaryWarning"
      onValidate={async () => {
        if (!detailedConfiguration) {
          throw new Error("Agent configuration not found");
        }
        const body: PostOrPatchAgentConfigurationRequestBody = {
          assistant: {
            name: agentConfiguration.name,
            description: agentConfiguration.description,
            instructions: agentConfiguration.instructions,
            pictureUrl: agentConfiguration.pictureUrl,
            status: "active",
            scope: "published",
            model: agentConfiguration.model,
            actions: detailedConfiguration.actions,
            templateId: agentConfiguration.templateId,
            maxStepsPerRun: agentConfiguration.maxStepsPerRun,
            visualizationEnabled: agentConfiguration.visualizationEnabled,
          },
        };

        const res = await fetch(
          `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const data = await res.json();
          sendNotification({
            title: `Error removing from Company assistants`,
            description: data.error.message,
            type: "error",
          });
        } else {
          sendNotification({
            title: `Assistant removed from Company assistants`,
            type: "success",
          });
          onRemove();
        }

        onClose();
      }}
    >
      <div className="flex flex-col gap-2">
        <div>
          Removing the assistant from the Company assistants means it won't be
          automatically active for members anymore.
        </div>
        <div>Any workspace member will be able to modify the assistant.</div>
      </div>
    </Dialog>
  );
}
