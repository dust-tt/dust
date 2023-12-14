import {
  Avatar,
  Button,
  Chip,
  MoreIcon,
  PlusIcon
} from "@dust-tt/sparkle";
import { AgentConfigurationType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

export default function GalleryItem({
  owner,
  agentConfiguration,
  onShowDetails,
  onUpdate,
}: {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
  onShowDetails: () => void;
  onUpdate: () => void;
}) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

  return (
    <div className="flex flex-row gap-2">
      <Avatar
        visual={<img src={agentConfiguration.pictureUrl} alt="Agent Avatar" />}
        size="md"
      />
      <div className="flex flex-col gap-2">
        <div className="text-md font-medium text-element-900">
          @{agentConfiguration.name}
        </div>
        <div className="flex flex-row gap-2">
          {agentConfiguration.userListStatus === "in-list" && (
            <Chip color="emerald" size="xs" label="Added" />
          )}
          <Button.List isWrapping={true}>
            {agentConfiguration.userListStatus !== "in-list" && (
              <>
                <Button
                  variant="tertiary"
                  icon={PlusIcon}
                  disabled={isAdding}
                  size="xs"
                  label={"Add"}
                  onClick={async () => {
                    setIsAdding(true);

                    const body: PostAgentListStatusRequestBody = {
                      agentId: agentConfiguration.sId,
                      listStatus: "in-list",
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
                        title: `Error adding Assistant`,
                        description: data.error.message,
                        type: "error",
                      });
                    } else {
                      sendNotification({
                        title: `Assistant added`,
                        type: "success",
                      });
                      onUpdate();
                    }

                    setIsAdding(false);
                  }}
                />
                {/*
                <Button
                  variant="tertiary"
                  icon={PlayIcon}
                  size="xs"
                  label={"Test"}
                  onClick={() => {
                    // TODO: test
                  }}
                />
                */}
              </>
            )}
            <Button
              variant="tertiary"
              icon={MoreIcon}
              size="xs"
              label={"Show Assistant"}
              labelVisible={false}
              onClick={() => {
                onShowDetails();
              }}
            />
          </Button.List>
        </div>
        <div className="text-sm text-element-800">
          {agentConfiguration.description}
        </div>
      </div>
    </div>
  );
}