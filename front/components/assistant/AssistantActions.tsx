import { Dialog, useSendNotification } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  WorkspaceType,
} from "@dust-tt/types";

import {
  useAgentConfiguration,
  useUpdateUserFavorite,
} from "@app/lib/swr/assistants";

export function RemoveAssistantFromFavoritesDialog({
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
  const { updateUserFavorite } = useUpdateUserFavorite({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  return (
    <Dialog
      isOpen={show}
      title={`Remove from favorites`}
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="warning"
      onValidate={async () => {
        void updateUserFavorite(false);
        onClose();
      }}
    >
      <div>
        This will remove the assistant from favorites. You can add it back at
        any time from the Chat homepage.
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
  const sendNotification = useSendNotification();

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
      validateVariant="warning"
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
