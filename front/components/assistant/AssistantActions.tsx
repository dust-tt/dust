import { Dialog } from "@dust-tt/sparkle";
import { AgentConfigurationType } from "@dust-tt/types";
import { WorkspaceType } from "@dust-tt/types";
import { useContext } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

export function DeleteAssistantDialog({
  owner,
  agentConfigurationId,
  show,
  onClose,
  onDelete,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string;
  show: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  return (
    <Dialog
      isOpen={show}
      title={`Deleting assistant`}
      onCancel={onClose}
      validateLabel="Delete for Everyone"
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
        <div className="font-bold">Are you sure you want to delete?</div>

        <div>
          This will be permanent and delete the&nbsp;assistant
          for&nbsp;everyone.
        </div>
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
  agentConfiguration: AgentConfigurationType;
  show: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  return (
    <Dialog
      isOpen={show}
      title={`Remove @${agentConfiguration.name} from my list`}
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="primaryWarning"
      onValidate={async () => {
        const body: PostAgentListStatusRequestBody = {
          agentId: agentConfiguration.sId,
          listStatus: "not-in-list",
        };

        const res = await fetch(
          `/api/w/${owner.sId}/members/me/agent_list_status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const data = await res.json();
          sendNotification({
            title: `Error removing Assistant`,
            description: data.error.message,
            type: "error",
          });
        } else {
          sendNotification({
            title: `Assistant removed`,
            type: "success",
          });
          onRemove();
        }

        onClose();
      }}
    >
      <div>
        This will remove the assistant from your list. You can add it back to
        your list at any time from the assistant gallery.
      </div>
    </Dialog>
  );
}
