import {
  BracesIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MoreIcon,
  PencilSquareIcon,
  Spinner,
  StarIcon,
  StarStrokeIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useState } from "react";

import { DeleteAssistantDialog } from "@app/components/assistant/DeleteAssistantDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { useURLSheet } from "@app/hooks/useURLSheet";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import {
  getAgentBuilderRoute,
  getConversationRoute,
} from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { isAdmin, isBuilder, normalizeError } from "@app/types";

interface AssistantDetailsButtonBarProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  isAgentConfigurationValidating: boolean;
}

export function AssistantDetailsButtonBar({
  agentConfiguration,
  isAgentConfigurationValidating,
  owner,
}: AssistantDetailsButtonBarProps) {
  const { user } = useUser();
  const { onOpenChange: onOpenChangeAssistantModal } =
    useURLSheet("agentDetails");

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

  const { updateUserFavorite, isUpdatingFavorite } = useUpdateUserFavorite({
    owner,
    agentConfigurationId: agentConfiguration.sId,
  });

  if (
    !agentConfiguration ||
    agentConfiguration.status === "archived" ||
    !user
  ) {
    return null;
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
          tooltip={
            agentConfiguration.userFavorite || isFavoriteDisabled
              ? "Remove from favorites"
              : "Add to favorites"
          }
          size="sm"
          className="group-hover:hidden"
          variant="outline"
          disabled={isFavoriteDisabled}
          onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
        />

        <Button
          icon={StarIcon}
          tooltip={
            agentConfiguration.userFavorite || isFavoriteDisabled
              ? "Remove from favorites"
              : "Add to favorites"
          }
          size="sm"
          className="hidden group-hover:block"
          variant="outline"
          disabled={isFavoriteDisabled}
          onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
        />
      </div>

      <Button
        icon={ChatBubbleBottomCenterTextIcon}
        size="sm"
        variant="outline"
        tooltip="New conversation"
        href={getConversationRoute(
          owner.sId,
          "new",
          `agent=${agentConfiguration.sId}`
        )}
      />

      {agentConfiguration.scope !== "global" &&
        !isRestrictedFromAgentCreation && (
          <Button
            size="sm"
            tooltip="Edit agent"
            href={
              canEditAssistant
                ? getAgentBuilderRoute(owner.sId, agentConfiguration.sId)
                : undefined
            }
            disabled={!canEditAssistant}
            variant="outline"
            icon={PencilSquareIcon}
          />
        )}

      {agentConfiguration.scope !== "global" && (
        <AssistantDetailsDropdownMenu
          showTrigger
          agentConfiguration={agentConfiguration}
          owner={owner}
          onClose={() => onOpenChangeAssistantModal(false)}
        />
      )}
    </div>
  );
}

interface AssistantDetailsDropdownMenuProps {
  agentConfiguration?: LightAgentConfigurationType;
  owner: WorkspaceType;
  showTrigger?: boolean;
  onClose?: () => void;
  showEditOption?: boolean;
  contextMenuPosition?: { x: number; y: number };
}

export function AssistantDetailsDropdownMenu({
  agentConfiguration,
  owner,
  showTrigger = false,
  onClose,
  showEditOption = false,
  contextMenuPosition,
}: AssistantDetailsDropdownMenuProps) {
  const sendNotification = useSendNotification();
  const router = useRouter();

  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!agentConfiguration || agentConfiguration.status === "archived") {
    return false;
  }

  const allowDeletion = agentConfiguration?.canEdit || isAdmin(owner);
  const canEditAssistant = agentConfiguration?.canEdit || isAdmin(owner);

  const handleExportToYAML = async () => {
    setIsExporting(true);
    const response = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration?.sId}/export/yaml`
    );

    if (!response.ok) {
      const errorData = await response.json();
      sendNotification({
        title: "Export failed",
        description:
          errorData.error?.message || "An error occurred while exporting",
        type: "error",
      });
      setIsExporting(false);
      return;
    }

    const { yamlContent, filename } = await response.json();
    try {
      const blob = new Blob([yamlContent], { type: "application/yaml" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      sendNotification({
        title: "Export successful",
        description: `Agent "${agentConfiguration.name}" exported to YAML`,
        type: "success",
      });
    } catch (error) {
      sendNotification({
        title: "Export failed",
        description:
          normalizeError(error).message || "An error occurred while exporting",
        type: "error",
      });

      logger.error(
        { workspaceId: owner.sId, agentId: agentConfiguration.sId },
        "Failed to export agent configuration to YAML"
      );
    } finally {
      setIsExporting(false);
    }
  };

  const menuItems = agentConfiguration && (
    <>
      {showEditOption &&
        agentConfiguration.scope !== "global" &&
        canEditAssistant && (
          <DropdownMenuItem
            label="Edit agent"
            onClick={(e) => {
              e.stopPropagation();
              void router.push(
                getAgentBuilderRoute(owner.sId, agentConfiguration.sId)
              );
              onClose?.();
            }}
            icon={PencilSquareIcon}
          />
        )}
      <DropdownMenuItem
        label="Copy agent ID"
        onClick={async (e) => {
          e.stopPropagation();
          await navigator.clipboard.writeText(agentConfiguration.sId);
          onClose?.();
        }}
        icon={BracesIcon}
      />
      <DropdownMenuItem
        label={isExporting ? "Exporting..." : "Export to YAML"}
        onClick={(e) => {
          e.stopPropagation();
          void handleExportToYAML();
          onClose?.();
        }}
        icon={isExporting ? <Spinner size="xs" /> : DocumentIcon}
        disabled={isExporting}
      />
      {agentConfiguration.scope !== "global" && (
        <>
          <DropdownMenuItem
            label="Duplicate (New)"
            data-gtm-label="assistantDuplicationButton"
            data-gtm-location="assistantDetails"
            icon={ClipboardIcon}
            onClick={async (e) => {
              e.stopPropagation();
              onClose?.();
              await router.push(
                getAgentBuilderRoute(
                  owner.sId,
                  "new",
                  `duplicate=${agentConfiguration.sId}`
                )
              );
            }}
          />
          {allowDeletion && (
            <DropdownMenuItem
              label="Archive"
              icon={TrashIcon}
              onClick={(e) => {
                e.stopPropagation();
                setShowDeletionModal(true);
              }}
              variant="warning"
            />
          )}
        </>
      )}
    </>
  );

  // Context menu version
  return (
    <>
      <DeleteAssistantDialog
        owner={owner}
        isOpen={showDeletionModal}
        agentConfiguration={agentConfiguration}
        onClose={() => {
          setShowDeletionModal(false);
          onClose?.();
        }}
      />
      {contextMenuPosition && agentConfiguration ? (
        <DropdownMenu
          open={true}
          onOpenChange={(open) => !open && onClose?.()}
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <div
              style={{
                position: "fixed",
                left: contextMenuPosition.x,
                top: contextMenuPosition.y,
                width: 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>{menuItems}</DropdownMenuContent>
        </DropdownMenu>
      ) : showTrigger ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={MoreIcon} size="sm" variant="ghost" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>{menuItems}</DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
