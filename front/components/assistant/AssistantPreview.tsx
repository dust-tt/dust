import { Avatar, Button, Chip, MoreIcon, PlusIcon } from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  assertNever,
  PostOrPatchAgentConfigurationRequestBody,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

type AssistantPreviewVariant = "gallery" | "home";
type AssistantPreviewFlow = "personal" | "workspace";

interface AssistantPreviewProps {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
  onShowDetails: () => void;
  onUpdate: () => void;
  variant: AssistantPreviewVariant;
  flow: AssistantPreviewFlow;
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
  flow,
}: AssistantPreviewProps) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  // TODO(flav) Move notification logic to the caller. This maintains the purity of the component by
  // decoupling it from side-effect operations.
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

  const addToWorkspace = async () => {
    setIsAdding(true);

    const body: PostOrPatchAgentConfigurationRequestBody = {
      assistant: {
        name: agentConfiguration.name,
        description: agentConfiguration.description,
        pictureUrl: agentConfiguration.pictureUrl,
        status: "active",
        scope: "workspace",
        action: agentConfiguration.action,
        generation: agentConfiguration.generation,
      },
    };

    try {
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}`,
        {
          method: "PATCH",
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

  let addButton = null;
  switch (flow) {
    case "personal":
      addButton = agentConfiguration.userListStatus !== "in-list" && (
        <Button
          key="personall_add"
          variant="tertiary"
          icon={PlusIcon}
          disabled={isAdding}
          size="xs"
          label={"Add"}
          onClick={addToAgentList}
        />
      );
      break;
    case "workspace":
      addButton = agentConfiguration.scope === "published" && (
        <Button
          key="workspace_add"
          variant="tertiary"
          icon={PlusIcon}
          disabled={isAdding}
          size="xs"
          label={"Add to Workspace"}
          onClick={addToWorkspace}
        />
      );
      break;
    default:
      assertNever(flow);
  }

  const showAssistantButton = (
    <Button
      key="show_details"
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
    //     key="test"
    //     variant="tertiary"
    //     icon={PlayIcon}
    //     size="xs"
    //     label={"Test"}
    //     onClick={() => {
    //       // TODO: test
    //     }}
    //   />,
  ];

  let galleryChip = null;
  if (variant === "gallery") {
    switch (flow) {
      case "personal":
        galleryChip = agentConfiguration.userListStatus === "in-list" && (
          <Chip
            color="emerald"
            size="xs"
            label={agentConfiguration.scope === "global" ? "Active" : "Added"}
          />
        );
        break;
      case "workspace":
        galleryChip = ["workspace", "global"].includes(
          agentConfiguration.scope
        ) && (
          <Chip
            color="emerald"
            size="xs"
            label={agentConfiguration.scope === "global" ? "Active" : "Added"}
          />
        );
        break;
      default:
        assertNever(flow);
    }
  }

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
          {galleryChip}
          <Button.List isWrapping={true}>{buttonsToRender}</Button.List>
        </div>
        <div className={getDescriptionClassName(variant)}>
          {agentConfiguration.description}
        </div>
      </div>
    </div>
  );
}
