import {
  BracesIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MoreIcon,
  PencilSquareIcon,
  StarIcon,
  StarStrokeIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { useURLSheet } from "@app/hooks/useURLSheet";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";

interface AssistantDetailsButtonBarProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  canDelete?: boolean;
  isMoreInfoVisible?: boolean;
  showAddRemoveToFavorite?: boolean;
  isAgentConfigurationValidating: boolean;
}

export function AssistantDetailsButtonBar({
  agentConfiguration,
  isAgentConfigurationValidating,
  owner,
}: AssistantDetailsButtonBarProps) {
  const { user } = useUser();

  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("assistantDetails");

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

  const router = useRouter();

  const { updateUserFavorite, isUpdatingFavorite } = useUpdateUserFavorite({
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

  const allowDeletion = agentConfiguration.canEdit || isAdmin(owner);

  function AssistantDetailsDropdownMenu() {
    return (
      <>
        <DeleteAssistantDialog
          owner={owner}
          isOpen={showDeletionModal}
          agentConfiguration={agentConfiguration}
          onClose={() => {
            setShowDeletionModal(false);
            onOpenChangeAssistantModal(false);
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={MoreIcon} size="sm" variant="ghost" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Copy agent ID"
              onClick={async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(agentConfiguration.sId);
              }}
              icon={BracesIcon}
            />
            {agentConfiguration.scope !== "global" && (
              <>
                <DropdownMenuItem
                  label="Duplicate (New)"
                  data-gtm-label="assistantDuplicationButton"
                  data-gtm-location="assistantDetails"
                  icon={ClipboardIcon}
                  onClick={async (e) => {
                    await router.push(
                      `/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`
                    );
                    e.stopPropagation();
                  }}
                />
                {allowDeletion && (
                  <DropdownMenuItem
                    label="Archive"
                    icon={TrashIcon}
                    onClick={() => {
                      setShowDeletionModal(true);
                    }}
                    variant="warning"
                  />
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }

  const canEditAssistant = agentConfiguration.canEdit || isAdmin(owner);

  const isFavoriteDisabled =
    isAgentConfigurationValidating || isUpdatingFavorite;

  return (
    <div className="flex flex-row items-center gap-2 px-1.5">
      <div className="group">
        <Button
          icon={
            agentConfiguration.userFavorite || isFavoriteDisabled
              ? StarIcon
              : StarStrokeIcon
          }
          size="sm"
          className="group-hover:hidden"
          variant="outline"
          disabled={isFavoriteDisabled}
          onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
        />

        <Button
          icon={StarIcon}
          size="sm"
          className="hidden group-hover:block"
          variant="outline"
          disabled={isFavoriteDisabled}
          onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
        />
      </div>

      <Link
        href={`/w/${owner.sId}/assistant/new?assistant=${agentConfiguration.sId}`}
      >
        <Button
          icon={ChatBubbleBottomCenterTextIcon}
          size="sm"
          variant="outline"
        />
      </Link>

      {agentConfiguration.scope !== "global" &&
        !isRestrictedFromAgentCreation && (
          <Link
            onClick={(e) => !canEditAssistant && e.preventDefault()}
            href={`/w/${owner.sId}/builder/assistants/${
              agentConfiguration.sId
            }?flow=workspace_assistants`}
          >
            <Button
              size="sm"
              disabled={!canEditAssistant}
              variant="outline"
              icon={PencilSquareIcon}
            />
          </Link>
        )}

      {agentConfiguration.scope !== "global" && (
        <AssistantDetailsDropdownMenu />
      )}
    </div>
  );
}
