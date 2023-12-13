import { Button, Modal } from "@dust-tt/sparkle";
import { AgentConfigurationType } from "@dust-tt/types";
import { WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

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

  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  return (
    <Modal
      isOpen={show}
      title={`Deleting assistant`}
      onClose={onClose}
      hasChanged={false}
      variant="dialogue"
    >
      <div className="flex flex-col gap-2 p-6">
        <div className="grow text-sm font-medium text-element-900">
          Are you sure you want to delete?
        </div>

        <div className="text-sm font-normal text-element-800">
          This will be permanent and delete the&nbsp;assistant
          for&nbsp;everyone.
        </div>
      </div>
      <div className="flex flex-row justify-end gap-1">
        <Button
          label={isDeleting ? "Deleting..." : "Delete for Everyone"}
          disabled={isDeleting}
          variant="primaryWarning"
          onClick={async () => {
            setIsDeleting(true);
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
            setIsDeleting(false);
          }}
        />
      </div>
    </Modal>
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

  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  return (
    <Modal
      isOpen={show}
      title={`Remove @${agentConfiguration.name} from my list`}
      onClose={onClose}
      hasChanged={false}
      variant="dialogue"
    >
      <div className="flex flex-col gap-2 p-6">
        <div className="text-sm font-normal text-element-800">
          This will remove the assistant from your list. You can add it back to
          your list at any time from the assistant gallery.
        </div>
      </div>
      <div className="flex flex-row justify-end gap-1">
        <Button
          label={isRemoving ? "Removing..." : "Remove"}
          disabled={isRemoving}
          variant="primaryWarning"
          onClick={async () => {
            setIsRemoving(true);

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
            setIsRemoving(false);
          }}
        />
      </div>
    </Modal>
  );
}
