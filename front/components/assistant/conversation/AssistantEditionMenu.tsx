import {
  Button,
  ClipboardIcon,
  DropdownMenu,
  Icon,
  ListAddIcon,
  ListRemoveIcon,
  MoreIcon,
  PencilSquareIcon,
  PlayIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  AgentUserListStatus,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, isBuilder } from "@dust-tt/types";
import { useContext, useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/AssistantActions";
import { TryAssistantModal } from "@app/components/assistant/TryAssistantModal";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { updateAgentUserListStatus } from "@app/lib/client/dust_api";
import { useAgentConfiguration, useUser } from "@app/lib/swr";

interface AssistantEditionMenuProps {
  agentConfigurationId: string;
  owner: WorkspaceType;
  variant: "button" | "plain";
  onAgentDeletion?: () => void;
  tryButton?: boolean;
}

AssistantEditionMenu.defaultProps = {
  variant: "plain",
};

export function AssistantEditionMenu({
  // The `agentConfiguration` cannot be used directly as it isn't dynamically
  // updated upon user list mutations. This limitation stems from its
  // propagation method from <ConversationMessage>.
  agentConfigurationId,
  owner,
  variant,
  onAgentDeletion,
  tryButton,
}: AssistantEditionMenuProps) {
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);
  const { user } = useUser();
  const [showTryAssistantModal, setShowTryAssistantModal] = useState(false);
  const { agentConfiguration, mutateAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId,
    });

  const [showDeletionModal, setShowDeletionModal] =
    useState<LightAgentConfigurationType | null>(null);

  if (!agentConfiguration || !user) {
    return <></>;
  }

  if (agentConfiguration.scope === "global") {
    return <></>;
  }

  const isAgentWorkspace = agentConfiguration.scope === "workspace";
  const isAgentPublished = agentConfiguration.scope === "published";

  const isInList = agentConfiguration.userListStatus === "in-list";
  const canDelete = onAgentDeletion && (isBuilder(owner) || !isAgentWorkspace);

  const updateAgentUserList = async (listStatus: AgentUserListStatus) => {
    setIsUpdatingList(true);

    const { success, errorMessage } = await updateAgentUserListStatus({
      listStatus,
      owner,
      agentConfigurationId: agentConfiguration.sId,
    });

    if (success) {
      sendNotification({
        title: `Assistant ${
          listStatus === "in-list"
            ? "added to your list"
            : "removed from your list"
        }`,
        type: "success",
      });

      await mutateAgentConfiguration();
    } else {
      sendNotification({
        title: `Error ${
          listStatus === "in-list" ? "adding" : "removing"
        } Assistant`,
        description: errorMessage,
        type: "error",
      });
    }

    setIsUpdatingList(false);
  };
  const showEditionHeader = isAgentPublished || tryButton;

  const dropdownButton = (() => {
    switch (variant) {
      case "button":
        return (
          <Button
            key="show_details"
            icon={MoreIcon}
            label="Actions"
            labelVisible={false}
            disabledTooltip
            size="sm"
            variant="tertiary"
            hasMagnifying={false}
          />
        );
      case "plain":
        return <Icon visual={MoreIcon} />;
      default:
        assertNever(variant);
    }
  })();
  return (
    <>
      {canDelete && showDeletionModal && (
        <DeleteAssistantDialog
          owner={owner}
          agentConfigurationId={showDeletionModal.sId}
          show={!!showDeletionModal}
          onClose={() => setShowDeletionModal(null)}
          onDelete={onAgentDeletion}
          isPrivateAssistant={showDeletionModal.scope === "private"}
        />
      )}
      {tryButton && showTryAssistantModal && (
        <TryAssistantModal
          owner={owner}
          user={user}
          assistant={agentConfiguration}
          onClose={() => setShowTryAssistantModal(false)}
        />
      )}

      <DropdownMenu className="text-element-700">
        <DropdownMenu.Button>{dropdownButton}</DropdownMenu.Button>
        <DropdownMenu.Items width={220}>
          {tryButton && (
            <DropdownMenu.Item
              label="Try"
              onClick={() => setShowTryAssistantModal(true)}
              icon={PlayIcon}
            />
          )}
          {showEditionHeader && <DropdownMenu.SectionHeader label="Edition" />}
          {/* Should use the router to have a better navigation experience */}
          {isBuilder(owner) && (
            <DropdownMenu.Item
              label="Edit"
              href={`/w/${owner.sId}/builder/assistants/${
                agentConfiguration.sId
              }?flow=${
                isAgentWorkspace
                  ? "workspace_assistants"
                  : "personal_assistants"
              }`}
              icon={PencilSquareIcon}
            />
          )}
          <DropdownMenu.Item
            label="Duplicate (New)"
            href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`}
            icon={ClipboardIcon}
          />
          {canDelete && (
            <DropdownMenu.Item
              label="Delete"
              icon={TrashIcon}
              variant="warning"
              onClick={() => setShowDeletionModal(agentConfiguration)}
            />
          )}

          {isAgentPublished && (
            <>
              <DropdownMenu.SectionHeader label="MY ASSISTANTS" />
              <DropdownMenu.Item
                label={isInList ? "Remove from my list" : "Add to my list"}
                disabled={isUpdatingList}
                onClick={() => {
                  void updateAgentUserList(
                    isInList ? "not-in-list" : "in-list"
                  );
                }}
                icon={isInList ? ListRemoveIcon : ListAddIcon}
              />
            </>
          )}
        </DropdownMenu.Items>
      </DropdownMenu>
    </>
  );
}
