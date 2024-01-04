import { AssistantPreview } from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  AgentUserListStatus,
  PostOrPatchAgentConfigurationRequestBody,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";

import {
  NotificationType,
  SendNotificationsContext,
} from "@app/components/sparkle/Notification";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

type AssistantPreviewFlow = "personal" | "workspace";

interface GalleryAssistantPreviewContainer {
  agentConfiguration: AgentConfigurationType;
  flow: AssistantPreviewFlow;
  onShowDetails: () => void;
  onUpdate: () => void;
  owner: WorkspaceType;
  setTestModalAssistant?: (agentConfiguration: AgentConfigurationType) => void;
}

const useAssistantUpdate = (
  agentConfiguration: AgentConfigurationType,
  owner: WorkspaceType,
  sendNotification: (notification: NotificationType) => void,
  onSuccess: (isAdded: boolean) => void,
  onError: () => void
) => {
  const updateAssistant = async (
    action: "added" | "removed",
    flow: AssistantPreviewFlow,
    listStatus: AgentUserListStatus,
    scope: "workspace" | "published"
  ) => {
    const isAdding = action === "added";
    const url =
      flow === "workspace"
        ? `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}`
        : `/api/w/${owner.sId}/members/me/agent_list_status`;
    const method = flow === "workspace" ? "PATCH" : "POST";

    const {
      action: agentAction,
      generation,
      name,
      description,
      pictureUrl,
    } = agentConfiguration;

    const body:
      | PostOrPatchAgentConfigurationRequestBody
      | PostAgentListStatusRequestBody =
      flow === "workspace"
        ? {
            assistant: {
              action: agentAction,
              description,
              generation,
              name,
              pictureUrl,
              scope,
              status: "active",
            },
          }
        : {
            agentId: agentConfiguration.sId,
            listStatus,
          };

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error((await response.json()).error.message);
      }

      sendNotification({
        title: `Assistant ${isAdding ? "added to" : "removed from"} ${
          flow === "workspace" ? "Workspace" : "your"
        } list`,
        type: "success",
      });

      onSuccess(isAdding);
    } catch (error) {
      sendNotification({
        title: `Error ${isAdding ? "adding" : "removing"} Assistant`,
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      onError();
    }
  };

  return updateAssistant;
};

export function GalleryAssistantPreviewContainer({
  agentConfiguration,
  flow,
  onShowDetails,
  onUpdate,
  owner,
  setTestModalAssistant,
}: GalleryAssistantPreviewContainer) {
  const [isUpdatingList, setIsUpdatingList] = useState(false);

  // Function to determine if the assistant is added based on the flow and configuration.
  const determineIfAdded = (
    agentConfiguration: AgentConfigurationType,
    currentFlow: AssistantPreviewFlow
  ) => {
    return currentFlow === "personal"
      ? agentConfiguration.userListStatus === "in-list"
      : agentConfiguration.scope === "workspace";
  };

  // Use the function to set the initial state.
  const [isAdded, setIsAdded] = useState(() =>
    determineIfAdded(agentConfiguration, flow)
  );

  // Effect to update isAdded when agentConfiguration or flow changes.
  useEffect(() => {
    setIsAdded(determineIfAdded(agentConfiguration, flow));
  }, [agentConfiguration, flow]);

  const handleSuccess = (isAdded: boolean) => {
    setIsAdded(isAdded);
    setIsUpdatingList(false);
    onUpdate();
  };

  const handleError = () => {
    setIsUpdatingList(false);
  };

  const updateStatus = useAssistantUpdate(
    agentConfiguration,
    owner,
    useContext(SendNotificationsContext),
    handleSuccess,
    handleError
  );

  const handleUpdate = async (action: "added" | "removed") => {
    const isAdding = action === "added";
    const newScope = isAdding ? "workspace" : "published";
    const newListStatus = isAdding ? "in-list" : "not-in-list";

    setIsUpdatingList(true);

    return updateStatus(action, flow, newListStatus, newScope);
  };

  const handleTestClick = () => setTestModalAssistant?.(agentConfiguration);

  const { description, lastAuthors, name, pictureUrl, scope } =
    agentConfiguration;

  const isGlobal = scope === "global";
  const isAddedToWorkspace = flow === "workspace" && isAdded;
  return (
    <AssistantPreview
      allowAddAction={!isGlobal}
      allowRemoveAction={!isGlobal && !isAddedToWorkspace}
      description={description}
      isAdded={isAdded}
      isUpdatingList={isUpdatingList}
      isWorkspace={flow === "workspace"}
      name={name}
      pictureUrl={pictureUrl}
      subtitle={lastAuthors?.join(", ") ?? ""}
      variant="lg"
      onUpdate={handleUpdate}
      onTestClick={!isGlobal && !isAdded ? handleTestClick : undefined}
      onShowDetailsClick={onShowDetails}
    />
  );
}
