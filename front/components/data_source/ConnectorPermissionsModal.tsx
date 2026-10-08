import type { ConfirmDataType } from "@app/components/Confirm";
import { ConfirmContext } from "@app/components/Confirm";
import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { getContentNodeParents } from "@app/components/contentNodeTreeSelection";
import { CreateOrUpdateConnectionBigQueryModal } from "@app/components/data_source/CreateOrUpdateConnectionBigQueryModal";
import { CreateOrUpdateConnectionSnowflakeModal } from "@app/components/data_source/CreateOrUpdateConnectionSnowflakeModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { SetupNotionPrivateIntegrationModal } from "@app/components/data_source/SetupNotionPrivateIntegrationModal";
import { useSensitivityLabelsController } from "@app/components/shared/labels/useSensitivityLabelsController";
import { setupConnection } from "@app/components/spaces/AddConnectionMenu";
import { AdvancedNotionManagement } from "@app/components/spaces/AdvancedNotionManagement";
import { ConnectorDataUpdatedModal } from "@app/components/spaces/ConnectorDataUpdatedModal";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useCellContext } from "@app/lib/auth/CellContext";
import { formatTimestampToFriendlyDate } from "@app/lib/client/friendly_date";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  CONNECTOR_UI_CONFIGURATIONS,
  getConnectorPermissionsConfigurableBlocked,
  isConnectorPermissionsEditable,
} from "@app/lib/connector_providers_ui";
import {
  getDisplayNameForDataSource,
  isRemoteDatabase,
} from "@app/lib/data_sources";
import { clientFetch } from "@app/lib/egress/client";
import {
  useConnectorConfig,
  useConnectorPermissions,
  useFetchConnectorPermissions,
  useOAuthMetadata,
} from "@app/lib/swr/connectors";
import { useSlackIsLegacy } from "@app/lib/swr/oauth";
import { useSpaceDataSourceViews, useSystemSpace } from "@app/lib/swr/spaces";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
import type { CellInfo } from "@app/types/cell";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodeWithParent,
  UpdateConnectorRequestBody,
} from "@app/types/connectors/connectors_api";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
} from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { isOAuthProvider } from "@app/types/oauth/lib";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type {
  EditedByUser,
  LightWorkspaceType,
  WorkspaceType,
} from "@app/types/user";
import type { NotificationType } from "@dust-tt/sparkle";
import {
  Avatar,
  Button,
  CloudArrowLeftRight,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Hoverable,
  Icon,
  InfoCircle,
  Lock01,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSWRConfig } from "swr";

const getUseResourceHook =
  (owner: LightWorkspaceType, dataSource: DataSourceType) =>
  (parentId: string | null) =>
    useConnectorPermissions({
      dataSource,
      filterPermission: null,
      owner,
      parentId,
      viewType: "all",
    });

async function handleUpdatePermissions(
  connector: ConnectorType,
  dataSource: DataSourceType,
  owner: LightWorkspaceType,
  extraConfig: Record<string, string>,
  sendNotification: (notification: NotificationType) => void,
  sendApiErrorNotification: (args: { title: string; error: unknown }) => void,
  cellInfo: CellInfo | null,
  t: (descriptor: MessageDescriptor) => string
) {
  const provider = connector.type;

  const connectionRes = await setupConnection({
    owner,
    provider,
    extraConfig,
    cellInfo,
  });
  if (connectionRes.isErr()) {
    sendApiErrorNotification({
      title: t(msg`Failed to update the permissions`),
      error: connectionRes.error,
    });
    return;
  }

  const updateRes = await updateConnectorConnectionId(
    connectionRes.value.connectionId,
    extraConfig,
    provider,
    dataSource,
    owner,
    t
  );
  if (updateRes.error) {
    sendNotification({
      type: "error",
      title: t(msg`Failed to update the connection`),
      description: updateRes.error,
    });
    return;
  }

  // Slack connectors will rely on customer credentials, we need to set a reference to it on the connector to be able to properly uninstall the app on connector deletion
  if (connector.type === "slack" && connectionRes.value.relatedCredentialId) {
    const credentialRes = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/privateIntegrationCredentialId`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          configValue: connectionRes.value.relatedCredentialId,
        }),
      }
    );

    if (!credentialRes.ok) {
      sendNotification({
        type: "error",
        title: t(msg`Failed to update the connection`),
        description: t(
          msg`The connection was updated but the credential could not be set.`
        ),
      });
      return;
    }
  }

  sendNotification({
    type: "success",
    title: t(msg`Successfully updated connection`),
    description: t(msg`The connection was successfully updated.`),
  });
}

export async function updateConnectorConnectionId(
  newConnectionId: string,
  newExtraConfig: Record<string, string>,
  provider: ConnectorProvider,
  dataSource: DataSourceType,
  owner: LightWorkspaceType,
  t: (descriptor: MessageDescriptor) => string
) {
  const res = await clientFetch(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId: newConnectionId,
        extraConfig: newExtraConfig,
      } satisfies UpdateConnectorRequestBody),
    }
  );

  if (res.ok) {
    return { success: true, error: null };
  }

  const jsonErr = await res.json();
  const error = jsonErr.error;

  if (error.type === "connector_oauth_target_mismatch") {
    return {
      success: false,
      error: t(CONNECTOR_UI_CONFIGURATIONS[provider].mismatchError),
    };
  }
  if (error.type === "connector_oauth_user_missing_rights") {
    return {
      success: false,
      error: t(
        msg`The authenticated user needs higher permissions from your service provider.`
      ),
    };
  }

  return {
    success: false,
    error: t(
      msg`Failed to update the permissions of the data source. Please retry to reconnect, or contact support@dust.tt for assistance if the problem persists.`
    ),
  };
}

interface DataSourceManagementModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

function DataSourceManagementModal({
  children,
  isOpen,
  onClose,
}: DataSourceManagementModalProps) {
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <Trans>Manage connection</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>{children}</SheetContainer>
      </SheetContent>
    </Sheet>
  );
}

function ConnectionSetupDescription({
  editedByUser,
  isDataSourceOwner,
}: {
  editedByUser: EditedByUser | null | undefined;
  isDataSourceOwner: boolean;
}) {
  const ownerFullName = editedByUser?.fullName;
  const setupDate = editedByUser?.editedAt
    ? formatTimestampToFriendlyDate(editedByUser.editedAt)
    : null;

  if (isDataSourceOwner) {
    return setupDate ? (
      <Trans>
        <span className="font-bold">You</span> set it up on {setupDate}
      </Trans>
    ) : (
      <Trans>
        <span className="font-bold">You</span> set it up.
      </Trans>
    );
  }

  return setupDate ? (
    <Trans>
      <span className="font-bold">{ownerFullName}</span> set it up on{" "}
      {setupDate}
    </Trans>
  ) : (
    <Trans>
      <span className="font-bold">{ownerFullName}</span> set it up.
    </Trans>
  );
}

interface UpdateConnectionOAuthModalProps {
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
  onEditPermissionsClick: (extraConfig: Record<string, string>) => void;
  owner: LightWorkspaceType;
}

function UpdateConnectionOAuthModal({
  dataSource,
  isOpen,
  onClose,
  onEditPermissionsClick,
  owner,
}: UpdateConnectionOAuthModalProps) {
  const { t } = useLingui();
  const { isDark } = useTheme();
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});
  const [isExtraConfigValid, setIsExtraConfigValid] = useState(true);
  const { hasFeature } = useFeatureFlags();

  const { user } = useAuth();

  const { connectorProvider, editedByUser } = dataSource;

  const isSlack = connectorProvider === "slack";
  const isMicrosoft = connectorProvider === "microsoft";
  const isZendesk = connectorProvider === "zendesk";

  // Fetch existing OAuth metadata when modal is open
  const { metadata, isMetadataLoading } = useOAuthMetadata({
    dataSource,
    owner,
    disabled:
      !isOpen || !dataSource.connectorId || (!isMicrosoft && !isZendesk),
  });

  // Populate extraConfig from metadata on first load only
  // This preserves user's unsaved changes when closing/reopening the modal
  useEffect(() => {
    if (isOpen && !isMetadataLoading && isMicrosoft) {
      if (metadata?.client_id) {
        // Convert metadata to string Record
        // extraConfig is needed only in the Service Principal case) (i.e., when client_id is present in metadata)
        const stringMetadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(metadata)) {
          if (typeof value === "string") {
            stringMetadata[key] = value;
          }
        }
        setExtraConfig(stringMetadata);
      }
    }
    if (isZendesk) {
      const { zendesk_subdomain } = metadata ?? {};
      if (!isString(zendesk_subdomain)) {
        return;
      }
      setExtraConfig({
        zendesk_subdomain,
      });
    }
  }, [
    isOpen,
    metadata,
    isMetadataLoading,
    isMicrosoft,
    isZendesk,
    dataSource.sId,
  ]);

  const { configValue: slackCredentialId } = useConnectorConfig({
    configKey: "privateIntegrationCredentialId",
    dataSource,
    owner,
    disabled:
      !isSlack || !hasFeature("self_created_slack_app_connector_rollout"),
  });

  const { isLegacySlackApp } = useSlackIsLegacy({
    workspaceId: owner.sId,
    credentialId: slackCredentialId,
    disabled:
      !isSlack ||
      !slackCredentialId ||
      !hasFeature("self_created_slack_app_connector_rollout"),
  });

  // TODO(slackstorm 2025-12-18): Decide if we want to migrate existing slack connections to the new model. Remove all those flags if it's the case.
  const MIGRATE_LEGACY_SLACK_APPS = false;
  const showSlackAppMigrationDisclaimer =
    MIGRATE_LEGACY_SLACK_APPS && isLegacySlackApp;
  const showSlackOauthExtraComponent =
    MIGRATE_LEGACY_SLACK_APPS ||
    hasFeature("self_created_slack_app_connector_rollout");

  if (!connectorProvider || !user) {
    return null;
  }

  const connectorConfiguration =
    connectorProvider && CONNECTOR_CONFIGURATIONS[connectorProvider];
  const connectorUIConfiguration =
    connectorProvider && CONNECTOR_UI_CONFIGURATIONS[connectorProvider];

  const isDataSourceOwner = editedByUser?.userId === user.sId;

  const connectedAccount = metadata?.connected_account;
  const microsoftAccount =
    isMicrosoft && isString(connectedAccount) ? connectedAccount : null;

  const permissionsConfigurable =
    getConnectorPermissionsConfigurableBlocked(connectorProvider);

  const connectorName = connectorConfiguration.name;

  return (
    <DataSourceManagementModal isOpen={isOpen} onClose={onClose}>
      <>
        <div className="mt-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Icon
              visual={connectorUIConfiguration.getLogoComponent(isDark)}
              size="md"
            />
            <Page.SectionHeader
              title={t`${connectorName} data & permissions`}
            />
          </div>

          {showSlackAppMigrationDisclaimer && (
            <div className="mt-4">
              <ContentMessage
                size="md"
                variant="warning"
                title={t`Migration required`}
                icon={InfoCircle}
              >
                <Trans>
                  You are using a legacy way to connect your Slack workspace to
                  Dust. Starting December 2025, all Slack connections require
                  customers to create their own Slack app. This change ensures
                  optimal performance and reliable real-time syncing.
                </Trans>
                <br />
                <br />
                <Trans>
                  Please follow the instructions of the section{" "}
                  <b>"Setting up the Connection"</b> in our{" "}
                  <Hoverable
                    href="https://docs.dust.tt/docs/slack-connection#setting-up-the-connection"
                    target="_blank"
                    variant="highlight"
                  >
                    official documentation
                  </Hoverable>{" "}
                  and enter your credentials below to{" "}
                  <b>complete the migration before March 3, 2026</b>.
                </Trans>
              </ContentMessage>
            </div>
          )}

          {isDataSourceOwner && (
            <div className="mb-4 mt-8 w-full rounded-lg bg-info-50 p-3">
              <div className="flex items-center gap-2 font-medium text-info-800">
                <Icon visual={InfoCircle} />
                <Trans>Important</Trans>
              </div>
              <div className="copy-sm p-4 text-info-900">
                <Trans>
                  <b>Editing</b> can break the existing data structure in Dust
                  and Agents using them.
                </Trans>
              </div>

              {connectorUIConfiguration.guideLink && (
                <div className="copy-sm pl-4 text-info-800">
                  <Trans>
                    Read our{" "}
                    <a
                      href={connectorUIConfiguration.guideLink}
                      className="text-highlight-600"
                      target="_blank"
                    >
                      Playbook
                    </a>
                    .
                  </Trans>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pb-4 pt-4">
          <Page.SectionHeader title={t`Connection owner`} />
          <div className="flex items-center gap-2">
            <Avatar visual={editedByUser?.imageUrl} size="sm" isRounded />
            <div>
              <ConnectionSetupDescription
                editedByUser={editedByUser}
                isDataSourceOwner={isDataSourceOwner}
              />
            </div>
          </div>
          {microsoftAccount && (
            <div className="copy-sm text-muted-foreground">
              <Trans>
                Authorized with Microsoft account{" "}
                <span className="font-bold">{microsoftAccount}</span>.
              </Trans>
            </div>
          )}
          {!isDataSourceOwner && (
            <div className="flex items-center justify-center gap-2">
              <RequestDataSourceModal
                dataSources={[dataSource]}
                owner={owner}
              />
            </div>
          )}
        </div>

        {!isDataSourceOwner && (
          <div className="item flex flex-col gap-2 border-t pt-4">
            <Page.SectionHeader title={t`Editing permissions`} />
            <ContentMessage
              size="md"
              variant="warning"
              title={t`You are not the owner of this connection.`}
              icon={InfoCircle}
            >
              <Trans>
                Editing permission rights with a different account will likely
                break the existing data structure in Dust and Agents using them.
              </Trans>
              {connectorUIConfiguration.guideLink && (
                <div>
                  <Trans>
                    Read our{" "}
                    <Hoverable
                      href={connectorUIConfiguration.guideLink}
                      variant="primary"
                      target="_blank"
                    >
                      Playbook
                    </Hoverable>
                    .
                  </Trans>
                </div>
              )}
            </ContentMessage>
          </div>
        )}
        {connectorUIConfiguration.oauthExtraConfigComponent &&
          ((isMicrosoft && !isMetadataLoading) ||
            showSlackOauthExtraComponent) && (
            <connectorUIConfiguration.oauthExtraConfigComponent
              extraConfig={extraConfig}
              setExtraConfig={setExtraConfig}
              setIsExtraConfigValid={setIsExtraConfigValid}
            />
          )}

        <div className="flex items-center justify-center">
          <Dialog>
            <DialogTrigger>
              <Button
                label={t`Edit permissions`}
                icon={Lock01}
                variant="warning"
                disabled={
                  !isExtraConfigValid || permissionsConfigurable.blocked
                }
              />
              {permissionsConfigurable.blocked && (
                <ContentMessage
                  title={t`Editing permissions is temporarily disabled`}
                  variant="info"
                  icon={InfoCircle}
                >
                  <ReactMarkdown>
                    {permissionsConfigurable.placeholder
                      ? t(permissionsConfigurable.placeholder)
                      : ""}
                  </ReactMarkdown>
                </ContentMessage>
              )}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <Trans>Are you sure?</Trans>
                </DialogTitle>
              </DialogHeader>
              <DialogContainer>
                <Trans>
                  The changes you are about to make may break existing{" "}
                  {connectorName} data sources and the agents using them. Are
                  you sure you want to continue?
                </Trans>
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: t`Cancel`,
                  variant: "outline",
                }}
                rightButtonProps={{
                  label: t`Continue`,
                  variant: "warning",
                  onClick: async () => {
                    void onEditPermissionsClick(extraConfig);
                  },
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </>
    </DataSourceManagementModal>
  );
}

interface DataSourceDeletionModalProps {
  dataSource: DataSourceType;
  isDeletable: boolean;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}
function DataSourceDeletionModal({
  dataSource,
  isDeletable,
  isOpen,
  onClose,
  owner,
}: DataSourceDeletionModalProps) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const sendNotification = useSendNotification();
  const { user } = useAuth();
  const { systemSpace } = useSystemSpace({
    workspaceId: owner.sId,
  });
  const { mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: systemSpace?.sId ?? "",
      disabled: true,
    });
  const { connectorProvider, editedByUser } = dataSource;

  if (!connectorProvider || !user || !systemSpace) {
    return null;
  }

  const isDataSourceOwner = editedByUser?.userId === user.sId;
  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connectorProvider];
  const connectorUIConfiguration =
    CONNECTOR_UI_CONFIGURATIONS[connectorProvider];
  const connectorName = connectorConfiguration.name;

  const handleDelete = async () => {
    setIsLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources/${dataSource.sId}`,
      {
        method: "DELETE",
      }
    );
    if (res.ok) {
      sendNotification({
        title: t`Successfully deleted connection`,
        type: "success",
        description: t`The connection has been successfully deleted.`,
      });
      await mutateSpaceDataSourceViews();
      onClose();
    } else {
      const err: unknown = await res.json();
      sendApiErrorNotification({
        title: t`Error deleting connection`,
        error: err,
      });
    }
    setIsLoading(false);
  };

  return (
    <DataSourceManagementModal isOpen={isOpen} onClose={onClose}>
      <>
        <div className="mt-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Icon
              visual={connectorUIConfiguration.getLogoComponent(isDark)}
              size="md"
            />
            <Page.SectionHeader
              title={t`Deleting ${connectorName} connection`}
            />
          </div>
          {isDeletable ? (
            <div className="mb-4 mt-8 w-full rounded-lg bg-info-50 p-3">
              <div className="flex items-center gap-2 font-medium text-info-800">
                <Icon visual={InfoCircle} />
                <Trans>Important</Trans>
              </div>
              <div className="p-4 text-sm text-info-900">
                <Trans>
                  <b>Deleting</b> will break Agents using this data.
                </Trans>
              </div>
            </div>
          ) : (
            <ContentMessage
              className="mb-4 mt-8"
              title={t`Connection removal requires support`}
              variant="warning"
              icon={InfoCircle}
            >
              <Trans>
                Removing a connection permanently deletes its synced data and
                may break agents or spaces that rely on it. Contact{" "}
                <Hoverable href="mailto:support@dust.tt" variant="highlight">
                  support@dust.tt
                </Hoverable>{" "}
                to be assisted with the removal of this connection.
              </Trans>
            </ContentMessage>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t pb-4 pt-4">
          <Page.SectionHeader title={t`Connection owner`} />
          <div className="flex items-center gap-2">
            <Avatar visual={editedByUser?.imageUrl} size="sm" isRounded />
            <div>
              <ConnectionSetupDescription
                editedByUser={editedByUser}
                isDataSourceOwner={isDataSourceOwner}
              />
            </div>
          </div>
        </div>
        {isDeletable && (
          <div className="flex items-center justify-center">
            <Dialog>
              <DialogTrigger>
                <Button
                  label={t`Delete connection`}
                  icon={Lock01}
                  variant="warning"
                />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    <Trans>Are you sure?</Trans>
                  </DialogTitle>
                </DialogHeader>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner variant="dark" size="md" />
                  </div>
                ) : (
                  <>
                    <DialogContainer>
                      <Trans>
                        The changes you are about to make will break existing
                        agents using {connectorName}. Are you sure you want to
                        continue?
                      </Trans>
                    </DialogContainer>
                    <DialogFooter
                      leftButtonProps={{
                        label: t`Cancel`,
                        variant: "outline",
                      }}
                      rightButtonProps={{
                        label: t`Delete`,
                        variant: "warning",
                        onClick: async () => {
                          await handleDelete();
                        },
                      }}
                    />
                  </>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}
      </>
    </DataSourceManagementModal>
  );
}

type ModalType =
  | "data_updated"
  | "edition"
  | "selection"
  | "deletion"
  | "private_integration"
  | null;

interface ConnectorPermissionsModalProps {
  connector: ConnectorType;
  dataSourceView: DataSourceViewType;
  initialModalState?: ModalType;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  onManageButtonClick?: () => void;
  owner: WorkspaceType;
  readOnly: boolean;
}

/**
 * @cc [owner:frankaloia,label:product;react] wait-for-bulk-selection-before-save
 * Saving connector permissions MUST remain unavailable while a bulk selection
 * operation is still loading descendants.
 */
export function ConnectorPermissionsModal({
  connector,
  dataSourceView,
  initialModalState = "selection",
  isAdmin,
  isOpen,
  onClose,
  onManageButtonClick,
  owner,
  readOnly,
}: ConnectorPermissionsModalProps) {
  const { t } = useLingui();
  const { mutate } = useSWRConfig();
  const cellContext = useCellContext();

  const confirm = useContext(ConfirmContext);
  const [selectedNodes, setSelectedNodes] = useState<
    Record<string, ContentNodeTreeItemStatus>
  >({});
  const [isBulkSelectionLoading, setIsBulkSelectionLoading] = useState(false);

  const dataSource = dataSourceView.dataSource;

  const isDeletable =
    dataSource.connectorProvider &&
    CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].isDeletable;

  const selectedPermission: ConnectorPermission = dataSource.connectorProvider
    ? CONNECTOR_UI_CONFIGURATIONS[dataSource.connectorProvider].permissions
        .selected
    : "none";

  const unselectedPermission: ConnectorPermission = dataSource.connectorProvider
    ? CONNECTOR_UI_CONFIGURATIONS[dataSource.connectorProvider].permissions
        .unselected
    : "none";

  const canUpdatePermissions = isConnectorPermissionsEditable(
    dataSource.connectorProvider
  );

  const useResourcesHook = useCallback(
    (parentId: string | null) =>
      getUseResourceHook(owner, dataSource)(parentId),
    [owner, dataSource]
  );

  const { resources: allSelectedResources, isResourcesLoading } =
    useConnectorPermissions({
      owner,
      dataSource,
      filterPermission: "read",
      parentId: null,
      viewType: "all",
      disabled: !canUpdatePermissions,
    });

  const { featureFlags } = useFeatureFlags();
  const advancedNotionManagement =
    dataSource.connectorProvider === "notion" &&
    featureFlags.includes("advanced_notion_management");

  const fetchChildResources = useFetchConnectorPermissions({
    owner,
    dataSource,
    viewType: "all",
  });

  const initialTreeSelectionModel = useMemo(
    () =>
      allSelectedResources.reduce<
        Record<string, ContentNodeTreeItemStatus<ContentNodeWithParent>>
      >(
        (acc, r) => ({
          ...acc,
          [r.internalId]: {
            isSelected: true,
            node: r,
            parents: getContentNodeParents(r),
          },
        }),
        {}
      ),
    [allSelectedResources]
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedNodes(initialTreeSelectionModel);
    }
  }, [initialTreeSelectionModel, isOpen]);

  const [modalToShow, setModalToShow] = useState<ModalType>(null);

  const { activeSubscription } = useWorkspaceActiveSubscription({
    owner,
    disabled: !isAdmin,
  });
  const plan = activeSubscription ? activeSubscription.plan : null;

  const [saving, setSaving] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { user } = useAuth();
  const sensitivityLabelsController = useSensitivityLabelsController({
    owner,
    source: { dataSourceId: dataSource.sId },
    disabled:
      modalToShow !== "selection" ||
      dataSource.connectorProvider !== "microsoft" ||
      !featureFlags.includes("sensitivity_labels"),
  });
  const advancedOptionsHasChanges = sensitivityLabelsController.isDirty;

  function closeModal(save: boolean) {
    setModalToShow(null);
    onClose(save);
    sensitivityLabelsController.reset();
    setTimeout(() => {
      setSelectedNodes({});
    }, 300);
  }

  async function save() {
    if (isBulkSelectionLoading) {
      return;
    }
    if (!isUnchanged) {
      if (
        !(await confirmPrivateNodesSync({
          selectedNodes: Object.values(selectedNodes)
            .filter((sn) => sn.isSelected)
            .map((sn) => sn.node),
          confirm,
          t,
        }))
      ) {
        return;
      }
    }
    setSaving(true);
    try {
      let didSave = false;

      if (!isUnchanged && Object.keys(selectedNodes).length) {
        const r = await clientFetch(
          `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              resources: Object.keys(selectedNodes).map((internalId) => ({
                internal_id: internalId,
                permission: selectedNodes[internalId].isSelected
                  ? selectedPermission
                  : unselectedPermission,
              })),
            }),
          }
        );

        if (!r.ok) {
          sendApiErrorNotification({
            title: t`Failed to update the permissions`,
            error: await r.json(),
          });
          return;
        } else {
          void mutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions`
              )
          );
          didSave = true;
        }
      }

      if (advancedOptionsHasChanges) {
        const advancedSaveSucceeded = await sensitivityLabelsController.save();
        if (!advancedSaveSucceeded) {
          return;
        }
        didSave = true;
      }

      if (didSave) {
        setModalToShow("data_updated");
      } else {
        closeModal(false);
      }
    } catch (e) {
      sendNotification({
        type: "error",
        title: t`Error saving connector configuration`,
        description: t`An unexpected error occurred while saving connector configuration.`,
      });
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const isUnchanged = useMemo(
    () =>
      Object.values(selectedNodes)
        .filter((item) => item.isSelected)
        .every(
          (item) =>
            item.isSelected ===
            initialTreeSelectionModel[item.node.internalId]?.isSelected
        ) &&
      Object.values(selectedNodes)
        .filter((item) => !item.isSelected)
        .every((item) => !initialTreeSelectionModel[item.node.internalId]),
    [selectedNodes, initialTreeSelectionModel]
  );

  useEffect(() => {
    if (isOpen) {
      setModalToShow(initialModalState);
    } else {
      setModalToShow(null);
    }
  }, [connector.type, initialModalState, isOpen]);

  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connector.type];
  const connectorUIConfiguration = CONNECTOR_UI_CONFIGURATIONS[connector.type];

  const OptionsComponent = connectorUIConfiguration.optionsComponent;
  const AdvancedOptionsComponent =
    connectorUIConfiguration.advancedOptionsComponent;

  const permissionsConfigurable = getConnectorPermissionsConfigurableBlocked(
    connector.type
  );

  const dataSourceDisplayName = getDisplayNameForDataSource(dataSource);

  return (
    <>
      {onManageButtonClick && (
        <Button
          size="sm"
          label={t`Manage ${dataSourceDisplayName}`}
          icon={CloudArrowLeftRight}
          variant="primary"
          disabled={readOnly || !isAdmin}
          onClick={() => {
            setModalToShow("selection");
            onManageButtonClick();
          }}
        />
      )}
      <Sheet
        open={modalToShow === "selection"}
        onOpenChange={(open) => {
          if (!open) {
            onClose(open);
          }
        }}
      >
        <SheetContent size="xl">
          {user && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <Trans>Manage {dataSourceDisplayName} connection</Trans>
                </SheetTitle>
                <div className="flex flex-row justify-end gap-2 py-1">
                  {(isOAuthProvider(connector.type) ||
                    isRemoteDatabase(dataSource)) && (
                    <Button
                      label={
                        !isRemoteDatabase(dataSource)
                          ? t`Edit permissions`
                          : t`Edit connection`
                      }
                      variant="outline"
                      icon={Lock01}
                      onClick={() => {
                        setModalToShow("edition");
                      }}
                      disabled={permissionsConfigurable.blocked}
                    />
                  )}
                  {dataSource.connectorProvider === "notion" &&
                    featureFlags.includes("notion_private_integration") && (
                      <Button
                        label={t`Setup private integration`}
                        variant="outline"
                        icon={Lock01}
                        onClick={() => setModalToShow("private_integration")}
                      />
                    )}
                  <Button
                    label={t`Delete connection`}
                    variant="warning"
                    icon={Trash01}
                    onClick={() => {
                      setModalToShow("deletion");
                    }}
                  />
                </div>
              </SheetHeader>

              <SheetContainer>
                <div className="dd-privacy-mask flex w-full flex-col gap-4">
                  {permissionsConfigurable.blocked && (
                    <ContentMessage
                      title={t`Editing permissions is temporarily disabled`}
                      variant="info"
                      icon={InfoCircle}
                    >
                      <ReactMarkdown>
                        {permissionsConfigurable.placeholder
                          ? t(permissionsConfigurable.placeholder)
                          : ""}
                      </ReactMarkdown>
                    </ContentMessage>
                  )}
                  {OptionsComponent && plan && (
                    <>
                      <div className="heading-xl p-1">
                        <Trans>Connection options</Trans>
                      </div>
                      <div className="p-1">
                        <div className="border-y border-border">
                          <OptionsComponent
                            {...{ owner, readOnly, isAdmin, dataSource, plan }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {!connectorUIConfiguration.isResourceSelectionDisabled && (
                    <>
                      <div className="flex items-center justify-between p-1">
                        <div className="heading-xl">
                          {connectorUIConfiguration.selectLabel &&
                            t(connectorUIConfiguration.selectLabel)}
                        </div>
                      </div>
                      <ContentNodeTree
                        isTitleFilterEnabled={
                          connectorUIConfiguration.isTitleFilterEnabled &&
                          canUpdatePermissions
                        }
                        isRoundedBackground={true}
                        useResourcesHook={useResourcesHook}
                        fetchChildResources={fetchChildResources}
                        onSelectAllLoadingChange={setIsBulkSelectionLoading}
                        selectedNodes={
                          canUpdatePermissions ? selectedNodes : undefined
                        }
                        setSelectedNodes={
                          canUpdatePermissions && !isResourcesLoading
                            ? setSelectedNodes
                            : undefined
                        }
                        showExpand={connectorUIConfiguration?.isNested}
                        emptyComponent={
                          connectorUIConfiguration.emptyNodeLabel
                            ? t(connectorUIConfiguration.emptyNodeLabel)
                            : undefined
                        }
                      />
                    </>
                  )}
                  {AdvancedOptionsComponent &&
                    featureFlags.includes("sensitivity_labels") && (
                      <Collapsible className="mb-4">
                        <CollapsibleTrigger>
                          <div className="heading-lg">
                            <Trans>Advanced</Trans>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-4">
                            <AdvancedOptionsComponent
                              owner={owner}
                              readOnly={readOnly}
                              controller={sensitivityLabelsController}
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                  {advancedNotionManagement && (
                    <AdvancedNotionManagement
                      owner={owner}
                      dataSource={dataSource}
                      sendNotification={sendNotification}
                    />
                  )}
                </div>
              </SheetContainer>
              {!connectorUIConfiguration.isResourceSelectionDisabled && (
                <SheetFooter
                  leftButtonProps={{
                    label: t`Cancel`,
                    variant: "outline",
                    onClick: () => closeModal(false),
                  }}
                  rightButtonProps={{
                    label: saving ? t`Saving...` : t`Save`,
                    variant: "primary",
                    disabled:
                      (isUnchanged && !advancedOptionsHasChanges) ||
                      saving ||
                      isBulkSelectionLoading,
                    onClick: save,
                  }}
                />
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Keep existing modals for edition/deletion/data update states */}
      {[connector].map((c) => {
        switch (c.type) {
          case "snowflake":
            return (
              <CreateOrUpdateConnectionSnowflakeModal
                key={`snowflake-${modalToShow}`}
                owner={owner}
                connectorProviderConfiguration={connectorConfiguration}
                isOpen={modalToShow === "edition"}
                onClose={() => closeModal(false)}
                dataSourceToUpdate={dataSource}
                onSuccess={() => {
                  setModalToShow("selection");
                }}
              />
            );
          case "bigquery":
            return (
              <CreateOrUpdateConnectionBigQueryModal
                key={`bigquery-${modalToShow}`}
                owner={owner}
                connectorProviderConfiguration={connectorConfiguration}
                isOpen={modalToShow === "edition"}
                onClose={() => closeModal(false)}
                dataSourceToUpdate={dataSource}
                onSuccess={() => {
                  setModalToShow("selection");
                }}
              />
            );
          case "github":
          case "confluence":
          case "google_drive":
          case "intercom":
          case "notion":
            if (modalToShow === "private_integration") {
              return (
                <SetupNotionPrivateIntegrationModal
                  isOpen={true}
                  onClose={() => closeModal(false)}
                  dataSource={dataSource}
                  owner={owner}
                  onSuccess={() => {
                    closeModal(false);
                  }}
                  sendNotification={sendNotification}
                />
              );
            }
          // Fall through to OAuth modal
          case "slack":
          case "microsoft":
          case "zendesk":
          case "webcrawler":
          case "salesforce":
          case "gong":
            return (
              <UpdateConnectionOAuthModal
                key={`${c.type}-${modalToShow}`}
                isOpen={modalToShow === "edition"}
                onClose={() => closeModal(false)}
                dataSource={dataSource}
                owner={owner}
                onEditPermissionsClick={async (
                  extraConfig: Record<string, string>
                ) => {
                  await handleUpdatePermissions(
                    connector,
                    dataSource,
                    owner,
                    extraConfig,
                    sendNotification,
                    sendApiErrorNotification,
                    cellContext.cellInfo,
                    t
                  );
                  closeModal(false);
                }}
              />
            );
          case "slack_bot":
          case "microsoft_bot":
            return null;
          case "dust_project":
            return null;
          default:
            assertNeverAndIgnore(c.type);
        }
      })}

      <DataSourceDeletionModal
        isOpen={modalToShow === "deletion"}
        onClose={() => closeModal(false)}
        dataSource={dataSource}
        isDeletable={Boolean(isDeletable)}
        owner={owner}
      />
      <ConnectorDataUpdatedModal
        isOpen={modalToShow === "data_updated"}
        onClose={() => {
          closeModal(false);
        }}
        connectorProvider={connector.type}
      />
    </>
  );
}

export async function confirmPrivateNodesSync({
  selectedNodes,
  confirm,
  t,
}: {
  selectedNodes: ContentNode[];
  confirm: (n: ConfirmDataType) => Promise<boolean>;
  t: (descriptor: MessageDescriptor) => string;
}): Promise<boolean> {
  // confirmation in case there are private nodes
  const privateNodes = selectedNodes.filter(
    (node) => node.providerVisibility === "private"
  );

  if (privateNodes.length > 0) {
    const privateNodeCount = privateNodes.length;
    const privateNodeTitles = privateNodes
      .slice(0, 3)
      .map((node) => node.title)
      .join(", ");
    const hiddenPrivateNodeCount = privateNodeCount - 3;

    return confirm({
      title: t(msg`Sensitive data synchronization`),
      message:
        hiddenPrivateNodeCount > 0
          ? t(
              msg`${plural(hiddenPrivateNodeCount, {
                one: `You are synchronizing data from private sources: ${privateNodeTitles} and # more. Is this okay?`,
                other: `You are synchronizing data from private sources: ${privateNodeTitles} and # more. Is this okay?`,
              })}`
            )
          : t(
              msg`${plural(privateNodeCount, {
                one: `You are synchronizing data from a private source: ${privateNodeTitles}. Is this okay?`,
                other: `You are synchronizing data from private sources: ${privateNodeTitles}. Is this okay?`,
              })}`
            ),
      validateVariant: "warning",
    });
  }
  return true;
}
