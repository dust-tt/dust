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
import { updateAgentUserListStatus } from "@app/lib/client/dust_api";
import { classNames } from "@app/lib/utils";

interface AssistantListActions {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  isParentHovered: boolean;
  onAssistantListUpdate?: () => void;
}

export default function AssistantListActions({
  agentConfiguration,
  isParentHovered,
  owner,
  onAssistantListUpdate,
}: AssistantListActions) {
  const { scope } = agentConfiguration;

  const sendNotification = useContext(SendNotificationsContext);

  // Use the function to set the initial state.
  const [isAdded, setIsAdded] = useState(
    () => agentConfiguration.userListStatus === "in-list"
  );

  if (scope !== "published") {
    return null;
  }

  const updateList = async (listStatus: AgentUserListStatus) => {
    const { success, errorMessage } = await updateAgentUserListStatus({
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
      onAssistantListUpdate && onAssistantListUpdate();
    } else {
      sendNotification({
        title: `Error updating assistant sharing.`,
        description: errorMessage,
        type: "error",
      });
    }
  };

  return (
    <div className="group">
      {isAdded && (
        <Chip
          label="In my list"
          icon={ListIcon}
          className={isAdded ? "group-hover:hidden" : "hidden"}
        />
      )}
      <div className={classNames("hidden", isAdded ? "group-hover:block" : "")}>
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
      </div>
      <div
        className={isParentHovered && !isAdded ? "group-hover:block" : "hidden"}
      >
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
      </div>
    </div>
  );
}
