import { Avatar, Button, Chip, MoreIcon, PlusIcon } from "@dust-tt/sparkle";
import { AgentConfigurationType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

type GalleryItemVariant = "home" | "gallery";

interface GalleryItemProps {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
  onShowDetails: () => void;
  onUpdate: () => void;
  variant: GalleryItemVariant;
}

export default function GalleryItem({
  owner,
  agentConfiguration,
  onShowDetails,
  onUpdate,
  variant,
}: GalleryItemProps) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

  const addToAgentList = async () => {
    setIsAdding(true);

    try {
      const body: PostAgentListStatusRequestBody = {
        agentId: agentConfiguration.sId,
        listStatus: "in-list",
      };

      const response = await fetch(
        `/api/w/${owner.sId}/members/me/agent_list_status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const data = await response.json();
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
    } catch (error) {
      sendNotification({
        title: `Error adding Assistant`,
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const addButton = agentConfiguration.userListStatus !== "in-list" && (
    <Button
      variant="tertiary"
      icon={PlusIcon}
      disabled={isAdding}
      size="xs"
      label={"Add"}
      onClick={addToAgentList}
    />
  );

  const showAssistantButton = (
    <Button
      icon={MoreIcon}
      label={"Show Assistant"}
      labelVisible={false}
      size="xs"
      variant="tertiary"
      onClick={onShowDetails}
    />
  );

  const defaultButtons = [
    showAssistantButton,
    // <Button
    //     variant="tertiary"
    //     icon={PlayIcon}
    //     size="xs"
    //     label={"Test"}
    //     onClick={() => {
    //       // TODO: test
    //     }}
    //   />,
  ];

  // Define button groups with JSX elements, including default buttons
  const buttonGroups: Record<GalleryItemVariant, JSX.Element[]> = {
    gallery: [addButton, showAssistantButton].filter(Boolean) as JSX.Element[],
    home: defaultButtons,
  };

  const buttonsToRender = buttonGroups[variant] || [];

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
          {agentConfiguration.userListStatus === "in-list" &&
            variant === "gallery" && (
              <Chip color="emerald" size="xs" label="Added" />
            )}
          <Button.List isWrapping={true}>{buttonsToRender}</Button.List>
        </div>
        <div className="text-sm text-element-800">
          {agentConfiguration.description}
        </div>
      </div>
    </div>
  );
}
