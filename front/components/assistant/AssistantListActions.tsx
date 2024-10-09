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
import React, { useState } from "react";

import { useUpdateAgentUserListStatus } from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";

interface AssistantListActions {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  isParentHovered: boolean;
}

export default function AssistantListActions({
  agentConfiguration,
  isParentHovered,
  owner,
}: AssistantListActions) {
  const { scope } = agentConfiguration;
  const doUpdate = useUpdateAgentUserListStatus({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  // Use the function to set the initial state.
  const [isAdded, setIsAdded] = useState(
    () => agentConfiguration.userListStatus === "in-list"
  );

  if (scope !== "published") {
    return null;
  }

  const updateList = async (listStatus: AgentUserListStatus) => {
    const success = await doUpdate(listStatus);
    if (success) {
      setIsAdded(listStatus === "in-list");
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
