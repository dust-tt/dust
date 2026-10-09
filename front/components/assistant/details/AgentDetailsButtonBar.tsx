import { DeleteAgentDialog } from "@app/components/assistant/DeleteAgentDialog";
import { useAgentSuggestionPreviewBatchId } from "@app/components/assistant/details/SuggestionPreviewContext";
import { trackSuggestionPreviewEdit } from "@app/components/markdown/suggestion/suggestionTracking";
import {
  trackManageItemAction,
  useManageTracking,
} from "@app/components/pages/builder/manageTracking";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { useAuth } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { hasHealthyProviders } from "@app/lib/utils/providersHealth";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getManageAgentsRoute,
} from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { canShowAgentConversationActions } from "@app/types/assistant/assistant";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Brackets,
  Button,
  Clipboard,
  ClipboardCheck,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  File02,
  MessagePlusCircle,
  Spinner,
  Star01,
  StarFilled,
  Trash01,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface AgentDetailsButtonBarProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  isAgentConfigurationValidating: boolean;
}

export function AgentDetailsButtonBar({
  agentConfiguration,
  isAgentConfigurationValidating,
  owner,
}: AgentDetailsButtonBarProps) {
  const { t } = useLingui();
  const tracking = useManageTracking();
  const { user, providersHealth } = useAuth();
  const router = useAppRouter();
  const previewBatchId = useAgentSuggestionPreviewBatchId();
  const [isAgentLinkCopied, copyAgentLink] = useCopyToClipboard();

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

  // The API redacts the private fields of the agents an admin cannot read, and flags it with
  // `canViewContent: false`.
  // When that's the case they cannnot edit/duplcate/export the agent.
  const isRedactedForAdmin = agentConfiguration.canViewContent === false;
  const canEditAgent =
    (agentConfiguration.canEdit || isAdmin(owner)) && !isRedactedForAdmin;

  const isFavoriteDisabled =
    isAgentConfigurationValidating || isUpdatingFavorite;

  const agentIsFavorite = agentConfiguration.userFavorite || isFavoriteDisabled;

  const handleNewConversation = async () => {
    trackManageItemAction(tracking, "try", agentConfiguration.sId);
    // Navigate only — closing the sheet first does a separate router.push that
    // races this navigation when opening a new conversation with ?agent=.
    await router.push(
      getConversationRoute(owner.sId, "new", `agent=${agentConfiguration.sId}`)
    );
  };

  return (
    <div className="flex flex-row items-center gap-2 px-1.5">
      <Button
        icon={agentIsFavorite ? StarFilled : Star01}
        tooltip={
          agentIsFavorite ? t`Remove from favorites` : t`Add to favorites`
        }
        size="sm"
        variant="outline"
        disabled={isFavoriteDisabled}
        onClick={() => updateUserFavorite(!agentConfiguration.userFavorite)}
      />

      {canShowAgentConversationActions(agentConfiguration.sId) &&
        !isRedactedForAdmin && (
          <Button
            icon={MessagePlusCircle}
            size="sm"
            variant="outline"
            tooltip={t`New conversation`}
            onClick={handleNewConversation}
          />
        )}

      {agentConfiguration.scope !== "global" && (
        <Button
          size="sm"
          tooltip={t`Edit agent`}
          href={
            canEditAgent
              ? getAgentBuilderRoute(owner.sId, agentConfiguration.sId)
              : undefined
          }
          disabled={!canEditAgent || !hasHealthyProviders(providersHealth)}
          onClick={() => {
            trackManageItemAction(tracking, "edit", agentConfiguration.sId);
            if (previewBatchId) {
              trackSuggestionPreviewEdit({
                batchId: previewBatchId,
                targetKind: "agent",
                targetId: agentConfiguration.sId,
              });
            }
          }}
          variant="outline"
          icon={Edit04}
        />
      )}

      <Button
        size="sm"
        tooltip={isAgentLinkCopied ? t`Copied!` : t`Copy link`}
        variant="outline"
        icon={isAgentLinkCopied ? ClipboardCheck : Clipboard}
        onClick={(e) => {
          e.stopPropagation();
          void copyAgentLink(
            `${config.getAppUrl()}${getManageAgentsRoute(owner.sId, agentConfiguration.sId)}`
          );
        }}
      />

      {agentConfiguration.scope !== "global" && (
        <AgentDetailsDropdownMenu
          showTrigger
          agentConfiguration={agentConfiguration}
          owner={owner}
        />
      )}
    </div>
  );
}

interface AgentDetailsDropdownMenuProps {
  agentConfiguration?: LightAgentConfigurationType;
  owner: WorkspaceType;
  showTrigger?: boolean;
  onClose?: () => void;
  showEditOption?: boolean;
  contextMenuPosition?: { x: number; y: number };
}

/**
 * @cc [owner:sfriquet,label:product] duplicate-requires-create-agent
 * The duplicate action MUST only be offered when the user holds the `create` grant on `agent`, the
 * workspace permission `NewAgentPage` requires to render the duplication flow.
 */
export function AgentDetailsDropdownMenu({
  agentConfiguration,
  owner,
  showTrigger = false,
  onClose,
  showEditOption = false,
  contextMenuPosition,
}: AgentDetailsDropdownMenuProps) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const router = useAppRouter();

  const { providersHealth } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const noHealthyProviders = !hasHealthyProviders(providersHealth);

  const tracking = useManageTracking();
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!agentConfiguration || agentConfiguration.status === "archived") {
    return false;
  }

  const isRedactedForAdmin = agentConfiguration.canViewContent === false;
  const allowDeletion = agentConfiguration.canEdit || isAdmin(owner);
  const canEditAgent =
    (agentConfiguration.canEdit || isAdmin(owner)) && !isRedactedForAdmin;

  const handleExportToYAML = async () => {
    setIsExporting(true);
    const response = await clientFetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration?.sId}/export/yaml`
    );

    if (!response.ok) {
      const errorData = await response.json();
      sendApiErrorNotification({ title: t`Export failed`, error: errorData });
      setIsExporting(false);
      return;
    }

    const { yamlContent, filename } = await response.json();
    const agentName = agentConfiguration.name;
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
        title: t`Export successful`,
        description: t`Agent "${agentName}" exported to YAML`,
        type: "success",
      });
    } catch (error) {
      sendNotification({
        title: t`Export failed`,
        description:
          normalizeError(error).message || t`An error occurred while exporting`,
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
        canEditAgent && (
          <DropdownMenuItem
            label={t`Edit agent`}
            disabled={noHealthyProviders}
            onClick={(e) => {
              e.stopPropagation();
              trackManageItemAction(tracking, "edit", agentConfiguration.sId);
              void router.push(
                getAgentBuilderRoute(owner.sId, agentConfiguration.sId)
              );
              onClose?.();
            }}
            icon={Edit04}
          />
        )}
      <DropdownMenuItem
        label={t`Copy agent ID`}
        onClick={async (e) => {
          e.stopPropagation();
          await navigator.clipboard.writeText(agentConfiguration.sId);
          onClose?.();
        }}
        icon={Brackets}
      />
      {!isRedactedForAdmin && (
        <DropdownMenuItem
          label={isExporting ? t`Exporting…` : t`Export to YAML`}
          onClick={(e) => {
            e.stopPropagation();
            void handleExportToYAML();
            onClose?.();
          }}
          icon={isExporting ? <Spinner size="xs" /> : File02}
          disabled={isExporting}
        />
      )}
      {agentConfiguration.scope !== "global" && (
        <>
          {!isRedactedForAdmin && hasPermission("create", "agent") && (
            <DropdownMenuItem
              label={t`Duplicate (new)`}
              disabled={noHealthyProviders}
              data-gtm-label="agentDuplicationButton"
              data-gtm-location="agentDetails"
              icon={Clipboard}
              onClick={async (e) => {
                e.stopPropagation();
                onClose?.();
                trackManageItemAction(
                  tracking,
                  "duplicate",
                  agentConfiguration.sId
                );
                await router.push(
                  getAgentBuilderRoute(
                    owner.sId,
                    "new",
                    `duplicate=${agentConfiguration.sId}`
                  )
                );
              }}
            />
          )}
          {allowDeletion && (
            <DropdownMenuItem
              label={t({ message: "Archive", context: "verb, menu item" })}
              icon={Trash01}
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
      <DeleteAgentDialog
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
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button icon={DotsHorizontal} size="sm" variant="outline" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>{menuItems}</DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
