import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  EyeIcon,
  Icon,
  MoreIcon,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuLabel,
  NewDropdownMenuTrigger,
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
import Link from "next/link";
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

      <NewDropdownMenu>
        <NewDropdownMenuTrigger>{dropdownButton}</NewDropdownMenuTrigger>
        <NewDropdownMenuContent>
          <NewDropdownMenuLabel label={agentConfiguration.name} />
          <Link
            href={`/w/${owner.sId}/assistant/new?assistant=${agentConfiguration.sId}`}
          >
            <NewDropdownMenuItem
              label="Start new conversation"
              icon={ChatBubbleBottomCenterTextIcon}
            />
          </Link>
          {isMoreInfoVisible ? (
            <NewDropdownMenuItem
              label="More info"
              onClick={(e) => {
                e.stopPropagation();
                setQueryParam(
                  router,
                  "assistantDetails",
                  agentConfiguration.sId
                );
              }}
              icon={EyeIcon}
            />
          ) : (
            <NewDropdownMenuItem
              label="Copy assistant ID"
              onClick={async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(agentConfiguration.sId);
              }}
              icon={ClipboardIcon}
            />
          )}

          {showAddRemoveToFavorite && (
            <>
              <NewDropdownMenuItem
                label={
                  isFavorite ? "Remove from favorites" : "Add to favorites"
                }
                disabled={isUpdatingFavorites}
                onClick={(e) => {
                  e.stopPropagation();
                  void updateFavorite(isFavorite ? false : true);
                }}
                icon={isFavorite ? StarIcon : StarStrokeIcon}
              />
            </>
          )}

          {!isGlobalAgent && (
            <>
              <NewDropdownMenuLabel label="Edition" />

              {/* Should use the router to have a better navigation experience */}
              {(isBuilder(owner) || !isAgentWorkspace) && (
                <Link
                  href={`/w/${owner.sId}/builder/assistants/${
                    agentConfiguration.sId
                  }?flow=${
                    isAgentWorkspace
                      ? "workspace_assistants"
                      : "personal_assistants"
                  }`}
                >
                  <NewDropdownMenuItem
                    label="Edit"
                    icon={PencilSquareIcon}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  />
                </Link>
              )}
              <Link
                href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`}
              >
                <NewDropdownMenuItem
                  label="Duplicate (New)"
                  icon={ClipboardIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              </Link>
              {allowDeletion && (
                <NewDropdownMenuItem
                  label="Delete"
                  icon={TrashIcon}
                  // TODO:
                  // variant="warning"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeletionModal(true);
                  }}
                />
              )}
            </>
          )}
        </NewDropdownMenuContent>
      </NewDropdownMenu>
    </>
  );
}
