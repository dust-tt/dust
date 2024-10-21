import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  DropdownMenu,
  EyeIcon,
  Icon,
  MoreIcon,
  PencilSquareIcon,
  StarIcon,
  StarStrokeIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, isBuilder } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { setQueryParam } from "@app/lib/utils/router";

interface AssistantDetailsMenuProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  variant?: "button" | "plain";
  canDelete?: boolean;
  isMoreInfoVisible?: boolean;
  showAddRemoveToFavorite?: boolean;
}

export function AssistantDropdownMenu({
  agentConfiguration,
  owner,
  variant = "plain",
  canDelete,
  isMoreInfoVisible,
  showAddRemoveToFavorite = false,
}: AssistantDetailsMenuProps) {
  const [isUpdatingFavorites, setIsUpdatingFavorite] = useState(false);
  const [showDeletionModal, setShowDeletionModal] = useState(false);

  const router = useRouter();

  const { user } = useUser();
  const doFavoriteUpdate = useUpdateUserFavorite({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  if (
    !agentConfiguration ||
    agentConfiguration.status === "archived" ||
    !user
  ) {
    return <></>;
  }

  const isAgentWorkspace = agentConfiguration.scope === "workspace";
  const isGlobalAgent = agentConfiguration.scope === "global";

  const isFavorite = agentConfiguration.userFavorite;
  const allowDeletion = canDelete && (isBuilder(owner) || !isAgentWorkspace);

  const updateFavorite = async (favorite: boolean) => {
    setIsUpdatingFavorite(true);
    await doFavoriteUpdate(favorite);
    setIsUpdatingFavorite(false);
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

  const onDeletionModalClose = () => {
    setShowDeletionModal(false);
  };

  return (
    <>
      <DeleteAssistantDialog
        owner={owner}
        isOpen={showDeletionModal}
        agentConfiguration={agentConfiguration}
        onClose={onDeletionModalClose}
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
                </>
              )}
              {showAddRemoveToFavorite && (
                <>
                  <DropdownMenu.SectionHeader label="MY ASSISTANTS" />
                  <DropdownMenu.Item
                    label={
                      isFavorite ? "Remove from favorites" : "Add to favorites"
                    }
                    disabled={isUpdatingFavorites}
                    onClick={() => {
                      void updateFavorite(isFavorite ? false : true);
                    }}
                    icon={isFavorite ? StarStrokeIcon : StarIcon}
                  />
                </>
              )}
            </DropdownMenu.Items>
          </>
        )}
      </DropdownMenu>
    </>
  );
}
