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
  NewDropdownMenuSeparator,
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
            size="sm"
            variant="outline"
            className="rounded-2xl"
          />
        );

      case "plain":
        return (
          <div>
            <Icon visual={MoreIcon} />
          </div>
        );

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
        <NewDropdownMenuTrigger asChild>
          {dropdownButton}
        </NewDropdownMenuTrigger>
        <NewDropdownMenuContent>
          <NewDropdownMenuLabel>{agentConfiguration.name}</NewDropdownMenuLabel>
          <NewDropdownMenuItem
            label="Start new conversation"
            icon={ChatBubbleBottomCenterTextIcon}
            onClick={() =>
              router.push(
                `/w/${owner.sId}/assistant/new?assistant=${agentConfiguration.sId}`
              )
            }
          />
          {isMoreInfoVisible ? (
            <NewDropdownMenuItem
              label="More info"
              icon={EyeIcon}
              onClick={(e) => {
                e.stopPropagation();
                setQueryParam(
                  router,
                  "assistantDetails",
                  agentConfiguration.sId
                );
              }}
            />
          ) : (
            <NewDropdownMenuItem
              label="Copy assistant ID"
              icon={ClipboardIcon}
              onClick={async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(agentConfiguration.sId);
              }}
            />
          )}
          {showAddRemoveToFavorite && (
            <NewDropdownMenuItem
              label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              icon={isFavorite ? StarStrokeIcon : StarIcon}
              disabled={isUpdatingFavorites}
              onClick={async (e) => {
                e.stopPropagation();
                await updateFavorite(!isFavorite);
              }}
            />
          )}
          {!isGlobalAgent && (
            <>
              <NewDropdownMenuSeparator />
              <NewDropdownMenuLabel>Edition</NewDropdownMenuLabel>
              {(isBuilder(owner) || !isAgentWorkspace) && (
                <NewDropdownMenuItem
                  label="Edit"
                  icon={PencilSquareIcon}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await router.push(
                      `/w/${owner.sId}/builder/assistants/${agentConfiguration.sId}?flow=${isAgentWorkspace ? "workspace_assistants" : "personal_assistants"}`
                    );
                  }}
                />
              )}
              <NewDropdownMenuItem
                label="Duplicate (New)"
                icon={ClipboardIcon}
                onClick={async (e) => {
                  e.stopPropagation();
                  await router.push(
                    `/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`
                  );
                }}
              />
              {allowDeletion && (
                <NewDropdownMenuItem
                  label="Delete"
                  icon={TrashIcon}
                  onClick={() => setShowDeletionModal(true)}
                />
              )}
            </>
          )}
        </NewDropdownMenuContent>
      </NewDropdownMenu>
    </>
  );
}
