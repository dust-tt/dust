import { Avatar, Button, Chip, MoreIcon, PlusIcon } from "@dust-tt/sparkle";
import { AgentConfigurationType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

type AssistantPreviewVariant = "gallery" | "home";

interface AssistantPreviewProps {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
  onShowDetails: () => void;
  onUpdate: () => void;
  variant: AssistantPreviewVariant;
}

function getDescriptionClassName(variant: AssistantPreviewVariant): string {
  switch (variant) {
    case "home":
      return "text-xs text-element-700";
    default:
      return "text-sm text-element-800";
  }
}

function getNameClassName(variant: AssistantPreviewVariant): string {
  switch (variant) {
    case "home":
      return "text-sm font-medium text-element-900";
    default:
      return "text-md font-medium text-element-900";
  }
}

export function AssistantPreview({
  owner,
  agentConfiguration,
  onShowDetails,
  onUpdate,
  variant,
}: AssistantPreviewProps) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  // TODO(flav) Move notification logic to the caller. This maintains the purity of the component by decoupling it from side-effect operations.
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
  const buttonGroups: Record<AssistantPreviewVariant, JSX.Element[]> = {
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
        <div className={getNameClassName(variant)}>
          @{agentConfiguration.name}
        </div>
        <div className="flex flex-row gap-2">
          {agentConfiguration.userListStatus === "in-list" &&
            variant === "gallery" && (
              <Chip color="emerald" size="xs" label="Added" />
            )}
          <Button.List isWrapping={true}>{buttonsToRender}</Button.List>
        </div>
        <div className={getDescriptionClassName(variant)}>
          {agentConfiguration.description}
        </div>
      </div>
    </div>
  );
}
