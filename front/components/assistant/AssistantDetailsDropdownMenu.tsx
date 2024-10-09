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
import { useRouter } from "next/router";
import { useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { useUpdateAgentUserListStatus } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { setQueryParam } from "@app/lib/utils/router";

interface AssistantDetailsDropdownMenuProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  variant?: "button" | "plain";
  canDelete?: boolean;
  isMoreInfoVisible?: boolean;
  showAddRemoveToList?: boolean;
}

export function AssistantDetailsDropdownMenu({
  agentConfiguration,
  owner,
  variant = "plain",
  canDelete,
  isMoreInfoVisible,
  showAddRemoveToList = false,
}: AssistantDetailsDropdownMenuProps) {
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const { user } = useUser();
  const doAgentListStatusUpdate = useUpdateAgentUserListStatus({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });
  const router = useRouter();
  const [showDeletionModal, setShowDeletionModal] = useState(false);

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
    await doAgentListStatusUpdate(listStatus);
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
      <DeleteAssistantDialog
        owner={owner}
        isOpen={showDeletionModal}
        agentConfiguration={agentConfiguration}
        onClose={() => {
          setShowDeletionModal(false);
        }}
        isPrivateAssistant={agentConfiguration.scope === "private"}
      />

      <DropdownMenu className="text-element-700">
        {({ close }) => (
          <>
            <DropdownMenu.Button>{dropdownButton}</DropdownMenu.Button>
            {/* TODO: get rid of the hardcoded value */}
            <DropdownMenu.Items width={230}>
              <DropdownMenu.SectionHeader label={agentConfiguration.name} />
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
              {isMoreInfoVisible ? (
                <DropdownMenu.Item
                  label="More info"
                  onClick={() =>
                    setQueryParam(
                      router,
                      "assistantDetails",
                      agentConfiguration.sId
                    )
                  }
                  icon={EyeIcon}
                />
              ) : (
                <DropdownMenu.Item
                  label={`Copy assistant ID`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await navigator.clipboard.writeText(agentConfiguration.sId);
                    close();
                  }}
                  icon={ClipboardIcon}
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
                  {allowDeletion && (
                    <DropdownMenu.Item
                      label="Delete"
                      icon={TrashIcon}
                      variant="warning"
                      onClick={() => {
                        setShowDeletionModal(true);
                      }}
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
