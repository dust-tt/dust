import { Dialog } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { useContext } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import {
  useAgentConfiguration,
  useUpdateAgentUserListStatus,
} from "@app/lib/swr/assistants";

export function RemoveAssistantFromListDialog({
  owner,
  agentConfiguration,
  show,
  onClose,
}: {
  owner: WorkspaceType;
  agentConfiguration: LightAgentConfigurationType;
  show: boolean;
  onClose: () => void;
}) {
  const doUpdate = useUpdateAgentUserListStatus({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  return (
    <Dialog
      isOpen={show}
      title={`Remove from my list`}
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="primaryWarning"
      onValidate={async () => {
        void doUpdate("not-in-list");
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
