import { AssistantPreview } from "@dust-tt/sparkle";
import {
  AgentUserListStatus,
  LightAgentConfigurationType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";

import {
  NotificationType,
  SendNotificationsContext,
} from "@app/components/sparkle/Notification";
import { isLargeModel } from "@app/lib/assistant";
import { isUpgraded } from "@app/lib/plans/free_plans";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

type AssistantPreviewFlow = "personal" | "workspace";

interface GalleryAssistantPreviewContainerProps {
  agentConfiguration: LightAgentConfigurationType;
  flow: AssistantPreviewFlow;
  onShowDetails: () => void;
  onUpdate: () => void;
  owner: WorkspaceType;
  plan: PlanType | null;
  setTestModalAssistant?: (
    agentConfiguration: LightAgentConfigurationType
  ) => void;
}

const useAssistantUpdate = (
  agentConfiguration: LightAgentConfigurationType,
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
        ? `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/scope`
        : `/api/w/${owner.sId}/members/me/agent_list_status`;

    const fullAssistantRes = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!fullAssistantRes.ok) {
      throw new Error(
        (await fullAssistantRes.json()).error.message ?? "Error fetching"
      );
    }

    const body:
      | { scope: "workspace" | "published" }
      | PostAgentListStatusRequestBody =
      flow === "workspace"
        ? {
            scope,
          }
        : {
            agentId: agentConfiguration.sId,
            listStatus,
          };

    try {
      const response = await fetch(url, {
        method: "POST",
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
  plan,
  setTestModalAssistant,
}: GalleryAssistantPreviewContainerProps) {
  const [isUpdatingList, setIsUpdatingList] = useState(false);

  // Function to determine if the assistant is added based on the flow and configuration.
  const determineIfAdded = (
    agentConfiguration: LightAgentConfigurationType,
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

  const { description, generation, lastAuthors, name, pictureUrl, scope } =
    agentConfiguration;

  const isGlobal = scope === "global";
  const isAddedToWorkspace = flow === "workspace" && isAdded;
  const hasAccessToLargeModels = isUpgraded(plan);
  const eligibleForTesting =
    hasAccessToLargeModels || !isLargeModel(generation?.model);
  const isTestable = !isGlobal && !isAdded && eligibleForTesting;
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
      onTestClick={isTestable ? handleTestClick : undefined}
      onShowDetailsClick={onShowDetails}
    />
  );
}
