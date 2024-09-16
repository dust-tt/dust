import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  DropdownMenu,
  EyeIcon,
  Icon,
  ListAddIcon,
  ListRemoveIcon,
  MoreIcon,
  PencilSquareIcon,
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
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { updateAgentUserListStatus } from "@app/lib/client/dust_api";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";

interface AssistantDetailsDropdownMenuProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  variant?: "button" | "plain";
  canDelete?: boolean;
  showAssistantDetails?: () => void;
  showAddRemoveToList?: boolean;
}

export function AssistantDetailsDropdownMenu({
  agentConfiguration,
  owner,
  variant = "plain",
  canDelete,
  showAssistantDetails,
  showAddRemoveToList = false,
}: AssistantDetailsDropdownMenuProps) {
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);
  const { user } = useUser();
  const { mutateAgentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
    disabled: true,
  });

  const [showDeletionModal, setShowDeletionModal] =
    useState<LightAgentConfigurationType | null>(null);

  if (
    !agentConfiguration ||
    agentConfiguration.status === "archived" ||
    !user
  ) {
    return <></>;
  }

  const isAgentWorkspace = agentConfiguration.scope === "workspace";
  const isAgentPublished = agentConfiguration.scope === "published";
  const isGlobalAgent = agentConfiguration.scope === "global";

  const isInList = agentConfiguration.userListStatus === "in-list";
  const allowDeletion = canDelete && (isBuilder(owner) || !isAgentWorkspace);

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
      {allowDeletion && showDeletionModal && (
        <DeleteAssistantDialog
          owner={owner}
          agentConfiguration={showDeletionModal}
          show={!!showDeletionModal}
          onClose={() => setShowDeletionModal(null)}
          isPrivateAssistant={showDeletionModal.scope === "private"}
        />
      )}

      <DropdownMenu className="text-element-700">
        {({ close }) => (
          <>
            <DropdownMenu.Button>{dropdownButton}</DropdownMenu.Button>
            {/* TODO: get rid of the hardcoded value */}
            <DropdownMenu.Items width={230}>
              <DropdownMenu.Item
                label="Start new conversation"
                link={{
                  href: `/w/${owner.sId}/assistant/new?assistant=${agentConfiguration.sId}`,
                }}
                icon={ChatBubbleBottomCenterTextIcon}
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                }}
              />
              {showAssistantDetails && (
                <DropdownMenu.Item
                  label={`More about @${agentConfiguration.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                    showAssistantDetails();
                  }}
                  icon={EyeIcon}
                />
              )}
              {!isGlobalAgent && (
                <>
                  <DropdownMenu.SectionHeader label="Edition" />

                  {/* Should use the router to have a better navigation experience */}
                  {(isBuilder(owner) || !isAgentWorkspace) && (
                    <DropdownMenu.Item
                      label="Edit"
                      link={{
                        href: `/w/${owner.sId}/builder/assistants/${
                          agentConfiguration.sId
                        }?flow=${
                          isAgentWorkspace
                            ? "workspace_assistants"
                            : "personal_assistants"
                        }`,
                      }}
                      icon={PencilSquareIcon}
                      onClick={(e) => {
                        e.stopPropagation();
                        close();
                      }}
                    />
                  )}
                  <DropdownMenu.Item
                    label="Duplicate (New)"
                    link={{
                      href: `/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`,
                    }}
                    icon={ClipboardIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                    }}
                  />
                  {canDelete && (
                    <DropdownMenu.Item
                      label="Delete"
                      icon={TrashIcon}
                      variant="warning"
                      onClick={() => setShowDeletionModal(agentConfiguration)}
                    />
                  )}

                  {isAgentPublished && showAddRemoveToList && (
                    <>
                      <DropdownMenu.SectionHeader label="MY ASSISTANTS" />
                      <DropdownMenu.Item
                        label={
                          isInList ? "Remove from my list" : "Add to my list"
                        }
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
                </>
              )}
            </DropdownMenu.Items>
          </>
        )}
      </DropdownMenu>
    </>
  );
}
