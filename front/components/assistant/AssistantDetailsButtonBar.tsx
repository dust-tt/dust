import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  DropdownMenu,
  MoreIcon,
  PencilSquareIcon,
  Separator,
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

  const updateUserFavorite = useUpdateUserFavorite({
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

        <DropdownMenu className="text-element-700">
          {({ close }) => (
            <>
              <DropdownMenu.Button>
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
              </DropdownMenu.Button>
              {/* TODO: get rid of the hardcoded value */}
              <DropdownMenu.Items width={230}>
                <DropdownMenu.Item
                  label={`Copy assistant ID`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await navigator.clipboard.writeText(agentConfiguration.sId);
                    close();
                  }}
                  icon={ClipboardIcon}
                />
                {agentConfiguration.scope !== "global" && (
                  <>
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
              </DropdownMenu.Items>
            </>
          )}
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
          icon={agentConfiguration.userFavorite ? StarIcon : StarStrokeIcon}
          label={`${agentConfiguration.userFavorite ? "Remove from" : "Add to"} favorites`}
          labelVisible={false}
          size="sm"
          className="group-hover:hidden"
          variant="tertiary"
          hasMagnifying={false}
          onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
        />

        <Button
          icon={agentConfiguration.userFavorite ? StarStrokeIcon : StarIcon}
          label={`${agentConfiguration.userFavorite ? "Remove from" : "Add to"} favorites`}
          labelVisible={false}
          size="sm"
          className="hidden group-hover:block"
          variant="tertiary"
          hasMagnifying={false}
          onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
        />
      </div>

      <Separator orientation="vertical" className="h-6" />

      <Link
        href={`/w/${owner.sId}/assistant/new?assistant=${agentConfiguration.sId}`}
      >
        <Button
          icon={ChatBubbleBottomCenterTextIcon}
          label="Chat with this assistant"
          labelVisible={false}
          size="sm"
          variant="tertiary"
          hasMagnifying={false}
        />
      </Link>

      {agentConfiguration.scope !== "global" && (
        <Link
          href={`/w/${owner.sId}/builder/assistants/${
            agentConfiguration.sId
          }?flow=${
            agentConfiguration.scope
              ? "workspace_assistants"
              : "personal_assistants"
          }`}
        >
          <Button
            label={
              canEditAssistant
                ? "Edit this assistant"
                : "Edition of this assistant is restricted"
            }
            labelVisible={false}
            size="sm"
            disabled={!canEditAssistant}
            variant="tertiary"
            hasMagnifying={false}
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
