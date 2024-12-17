import {
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
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";

interface AssistantDetailsButtonBarProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  canDelete?: boolean;
  isMoreInfoVisible?: boolean;
  showAddRemoveToFavorite?: boolean;
}

export function AssistantDetailsButtonBar({
  agentConfiguration,
  owner,
}: AssistantDetailsButtonBarProps) {
  const { user } = useUser();

  const [showDeletionModal, setShowDeletionModal] = useState(false);
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

  const allowDeletion =
    agentConfiguration.scope !== "global" &&
    (isBuilder(owner) || agentConfiguration.scope !== "workspace");

  function AssistantDetailsDropdownMenu() {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={MoreIcon} size="sm" variant="ghost" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Copy assistant ID"
              onClick={async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(agentConfiguration.sId);
              }}
              icon={ClipboardIcon}
            />
            {agentConfiguration.scope !== "global" && (
              <>
                <DropdownMenuItem
                  label="Duplicate (New)"
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
                    label="Delete"
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

  const canEditAssistant =
    // builders can all edit, non-builders can only edit personal/shared assistants
    isBuilder(owner) || !(agentConfiguration.scope === "workspace");

  return (
    <div className="flex flex-row items-center gap-2 px-1.5">
      <div className="group">
        <Button
          icon={
            agentConfiguration.userFavorite || isUpdatingFavorite
              ? StarIcon
              : StarStrokeIcon
          }
          size="sm"
          className="group-hover:hidden"
          variant="outline"
          disabled={isUpdatingFavorite}
          onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
        />

        <Button
          icon={StarIcon}
          size="sm"
          className="hidden group-hover:block"
          variant="outline"
          disabled={isUpdatingFavorite}
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

      {agentConfiguration.scope !== "global" && (
        <Link
          onClick={(e) => !canEditAssistant && e.preventDefault()}
          href={`/w/${owner.sId}/builder/assistants/${
            agentConfiguration.sId
          }?flow=${
            agentConfiguration.scope
              ? "workspace_assistants"
              : "personal_assistants"
          }`}
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
