import {
  Button,
  Chip,
  ListAddIcon,
  ListIcon,
  ListRemoveIcon,
} from "@dust-tt/sparkle";
import type {
  AgentUserListStatus,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import React, { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { updateAgentList } from "@app/lib/client/dust_api";

type AssistantPreviewFlowType = "personal" | "workspace";

interface AssistantListActions {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  isParentHovered: boolean;
  flow: AssistantPreviewFlowType;
}

export default function AssistantListActions({
  agentConfiguration,
  isParentHovered,
  owner,
  flow,
}: AssistantListActions) {
  const { scope } = agentConfiguration;
  const isGlobal = scope === "global";

  if (isGlobal) {
    return null; // Return null if isGlobal, since no actions are rendered in this case.
  }

  const [isHovered, setIsHovered] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  // Function to determine if the assistant is added based on the flow and configuration.
  const determineIfAdded = (
    agentConfiguration: LightAgentConfigurationType,
    currentFlow: AssistantPreviewFlowType
  ) => {
    return currentFlow === "personal"
      ? agentConfiguration.userListStatus === "in-list"
      : agentConfiguration.scope === "workspace";
  };

  // Use the function to set the initial state.
  const [isAdded, setIsAdded] = useState(() =>
    determineIfAdded(agentConfiguration, flow)
  );

  const updateList = async (listStatus: AgentUserListStatus) => {
    const { success, errorMessage } = await updateAgentList({
      owner,
      agentConfigurationId: agentConfiguration.sId,
      listStatus,
    });

    if (success) {
      setIsAdded(listStatus === "in-list");
      sendNotification({
        title: `Assistant sharing updated.`,
        type: "success",
      });
    } else {
      sendNotification({
        title: `Error updating assistant sharing.`,
        description: errorMessage,
        type: "error",
      });
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!isHovered && isAdded && <Chip label="In my list" icon={ListIcon} />}
      {isHovered && isAdded && (
        <Button
          label={"Remove from my list"}
          size="xs"
          hasMagnifying={false}
          variant="tertiary"
          icon={ListRemoveIcon}
          onClick={(e) => {
            e.stopPropagation();
            return updateList("not-in-list");
          }}
        />
      )}
      {isParentHovered && !isAdded && (
        <Button
          label={"Add to my list"}
          size="xs"
          hasMagnifying={false}
          variant="tertiary"
          icon={ListAddIcon}
          onClick={(e) => {
            e.stopPropagation();
            return updateList("in-list");
          }}
        />
      )}
    </div>
  );
}
