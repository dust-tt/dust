import type { NotificationType } from "@dust-tt/sparkle";
import {
  Avatar,
  Button,
  CloudArrowLeftRightIcon,
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
  LockIcon,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { useSWRConfig } from "swr";

import type { ConfirmDataType } from "@app/components/Confirm";
import { ConfirmContext } from "@app/components/Confirm";
import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { CreateOrUpdateConnectionBigQueryModal } from "@app/components/data_source/CreateOrUpdateConnectionBigQueryModal";
import { CreateOrUpdateConnectionSnowflakeModal } from "@app/components/data_source/CreateOrUpdateConnectionSnowflakeModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { SetupNotionPrivateIntegrationModal } from "@app/components/data_source/SetupNotionPrivateIntegrationModal";
import { setupConnection } from "@app/components/spaces/AddConnectionMenu";
import { AdvancedNotionManagement } from "@app/components/spaces/AdvancedNotionManagement";
import { ConnectorDataUpdatedModal } from "@app/components/spaces/ConnectorDataUpdatedModal";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorPermissionsConfigurableBlocked,
  isConnectorPermissionsEditable,
} from "@app/lib/connector_providers";
import {
  getDisplayNameForDataSource,
  isRemoteDatabase,
} from "@app/lib/data_sources";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import { useSpaceDataSourceViews, useSystemSpace } from "@app/lib/swr/spaces";
import { useUser } from "@app/lib/swr/user";
import {
  useFeatureFlags,
  useWorkspaceActiveSubscription,
} from "@app/lib/swr/workspaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type {
  APIError,
  ConnectorPermission,
  ConnectorProvider,
  ConnectorType,
  ContentNode,
  ContentNodeWithParent,
  DataSourceType,
  DataSourceViewType,
  LightWorkspaceType,
  UpdateConnectorRequestBody,
  WorkspaceType,
} from "@app/types";
import { assertNever, isOAuthProvider } from "@app/types";

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

export async function handleUpdatePermissions(
  connector: ConnectorType,
  dataSource: DataSourceType,
  owner: LightWorkspaceType,
  extraConfig: Record<string, string>,
  sendNotification: (notification: NotificationType) => void
) {
  const provider = connector.type;

  const connectionIdRes = await setupConnection({
    owner,
    provider,
    extraConfig,
  });
  if (connectionIdRes.isErr()) {
    sendNotification({
      type: "error",
      title: "Failed to update the permissions",
      description: connectionIdRes.error.message,
    });
    return;
  }

  const updateRes = await updateConnectorConnectionId(
    connectionIdRes.value,
    provider,
    dataSource,
    owner
  );
  if (updateRes.error) {
    sendNotification({
      type: "error",
      title: "Failed to update the connection",
      description: updateRes.error,
    });
  } else {
    sendNotification({
      type: "success",
      title: "Successfully updated connection",
      description: "The connection was successfully updated.",
    });
  }
}

export async function updateConnectorConnectionId(
  newConnectionId: string,
  provider: ConnectorProvider,
  dataSource: DataSourceType,
  owner: LightWorkspaceType
) {
  const res = await fetch(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId: newConnectionId,
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
      error: CONNECTOR_CONFIGURATIONS[provider].mismatchError,
    };
  }
  if (error.type === "connector_oauth_user_missing_rights") {
    return {
      success: false,
      error:
        "The authenticated user needs higher permissions from your service provider.",
    };
  }

  return {
    success: false,
    error: `Failed to update the permissions of the Data Source: (contact support@dust.tt for assistance)`,
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
          <SheetTitle>Manage Connection</SheetTitle>
        </SheetHeader>
        <SheetContainer>{children}</SheetContainer>
      </SheetContent>
    </Sheet>
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
  const { isDark } = useTheme();
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});
  const [isExtraConfigValid, setIsExtraConfigValid] = useState(true);

  const { user } = useUser();

  const { connectorProvider, editedByUser } = dataSource;

  useEffect(() => {
    if (isOpen) {
      setExtraConfig({});
    }
  }, [isOpen]);

  if (!connectorProvider || !user) {
    return null;
  }

  const connectorConfiguration =
    connectorProvider && CONNECTOR_CONFIGURATIONS[connectorProvider];

  const isDataSourceOwner = editedByUser?.userId === user.sId;

  const permissionsConfigurable =
    getConnectorPermissionsConfigurableBlocked(connectorProvider);
  return (
    <DataSourceManagementModal isOpen={isOpen} onClose={onClose}>
      <>
        <div className="mt-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Icon
              visual={connectorConfiguration.getLogoComponent(isDark)}
              size="md"
            />
            <Page.SectionHeader
              title={`${connectorConfiguration.name} data & permissions`}
            />
          </div>
          {isDataSourceOwner && (
            <div className="mb-4 mt-8 w-full rounded-lg bg-info-50 p-3">
              <div className="flex items-center gap-2 font-medium text-info-800">
                <Icon visual={InformationCircleIcon} />
                Important
              </div>
              <div className="copy-sm p-4 text-info-900">
                <b>Editing</b> can break the existing data structure in Dust and
                Agents using them.
              </div>

              {connectorConfiguration.guideLink && (
                <div className="copy-sm pl-4 text-info-800">
                  Read our{" "}
                  <a
                    href={connectorConfiguration.guideLink}
                    className="text-highlight-600"
                    target="_blank"
                  >
                    Playbook
                  </a>
                  .
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pb-4 pt-4">
          <Page.SectionHeader title="Connection Owner" />
          <div className="flex items-center gap-2">
            <Avatar visual={editedByUser?.imageUrl} size="sm" />
            <div>
              <span className="font-bold">
                {isDataSourceOwner ? "You" : editedByUser?.fullName}
              </span>{" "}
              set it up
              {editedByUser?.editedAt
                ? ` on ${formatTimestampToFriendlyDate(editedByUser?.editedAt)}`
                : "."}
            </div>
          </div>
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
            <Page.SectionHeader title="Editing permissions" />
            <ContentMessage
              size="md"
              variant="warning"
              title="You are not the owner of this connection."
              icon={InformationCircleIcon}
            >
              Editing permission rights with a different account will likely
              break the existing data structure in Dust and Agents using them.
              {connectorConfiguration.guideLink && (
                <div>
                  Read our{" "}
                  <Hoverable
                    href={connectorConfiguration.guideLink}
                    variant="primary"
                    target="_blank"
                  >
                    Playbook
                  </Hoverable>
                  .
                </div>
              )}
            </ContentMessage>
          </div>
        )}
        {connectorConfiguration.oauthExtraConfigComponent && (
          <connectorConfiguration.oauthExtraConfigComponent
            extraConfig={extraConfig}
            setExtraConfig={setExtraConfig}
            setIsExtraConfigValid={setIsExtraConfigValid}
          />
        )}

        <div className="flex items-center justify-center">
          <Dialog>
            <DialogTrigger>
              <Button
                label="Edit Permissions"
                icon={LockIcon}
                variant="warning"
                disabled={
                  !isExtraConfigValid || permissionsConfigurable.blocked
                }
              />
              {permissionsConfigurable.blocked && (
                <ContentMessage
                  title="Editing permissions is temporarily disabled"
                  variant="info"
                  icon={InformationCircleIcon}
                >
                  <ReactMarkdown>
                    {permissionsConfigurable.placeholder ?? ""}
                  </ReactMarkdown>
                </ContentMessage>
              )}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you sure?</DialogTitle>
              </DialogHeader>
              <DialogContainer>
                The changes you are about to make may break existing{" "}
                {connectorConfiguration.name} Data sources and the agents using
                them. Are you sure you want to continue?
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: "Cancel",
                  variant: "outline",
                }}
                rightButtonProps={{
                  label: "Continue",
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
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}
function DataSourceDeletionModal({
  dataSource,
  isOpen,
  onClose,
  owner,
}: DataSourceDeletionModalProps) {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const sendNotification = useSendNotification();
  const { user } = useUser();
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

  const handleDelete = async () => {
    setIsLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources/${dataSource.sId}`,
      {
        method: "DELETE",
      }
    );
    if (res.ok) {
      sendNotification({
        title: "Successfully deleted connection",
        type: "success",
        description: "The connection has been successfully deleted.",
      });
      await mutateSpaceDataSourceViews();
      onClose();
    } else {
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        title: "Error deleting connection",
        type: "error",
        description: err.error.message,
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
              visual={connectorConfiguration.getLogoComponent(isDark)}
              size="md"
            />
            <Page.SectionHeader
              title={`Deleting ${connectorConfiguration.name} connection`}
            />
          </div>
          <div className="mb-4 mt-8 w-full rounded-lg bg-info-50 p-3">
            <div className="flex items-center gap-2 font-medium text-info-800">
              <Icon visual={InformationCircleIcon} />
              Important
            </div>
            <div className="p-4 text-sm text-info-900">
              <b>Deleting</b> will break Agents using this data.
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t pb-4 pt-4">
          <Page.SectionHeader title="Connection Owner" />
          <div className="flex items-center gap-2">
            <Avatar visual={editedByUser?.imageUrl} size="sm" />
            <div>
              <span className="font-bold">
                {isDataSourceOwner ? "You" : editedByUser?.fullName}
              </span>{" "}
              set it up
              {editedByUser?.editedAt
                ? ` on ${formatTimestampToFriendlyDate(editedByUser?.editedAt)}`
                : "."}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <Dialog>
            <DialogTrigger>
              <Button
                label="Delete Connection"
                icon={LockIcon}
                variant="warning"
              />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you sure?</DialogTitle>
              </DialogHeader>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner variant="dark" size="md" />
                </div>
              ) : (
                <>
                  <DialogContainer>
                    The changes you are about to make will break existing agents
                    using {connectorConfiguration.name}. Are you sure you want
                    to continue?
                  </DialogContainer>
                  <DialogFooter
                    leftButtonProps={{
                      label: "Cancel",
                      variant: "outline",
                    }}
                    rightButtonProps={{
                      label: "Delete",
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
      </>
    </DataSourceManagementModal>
  );
}

interface ConnectorPermissionsModalProps {
  connector: ConnectorType;
  dataSourceView: DataSourceViewType;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  onManageButtonClick?: () => void;
  owner: WorkspaceType;
  readOnly: boolean;
}

export function ConnectorPermissionsModal({
  connector,
  dataSourceView,
  isAdmin,
  isOpen,
  onClose,
  onManageButtonClick,
  owner,
  readOnly,
}: ConnectorPermissionsModalProps) {
  const { mutate } = useSWRConfig();

  const confirm = useContext(ConfirmContext);
  const [selectedNodes, setSelectedNodes] = useState<
    Record<string, ContentNodeTreeItemStatus>
  >({});

  const dataSource = dataSourceView.dataSource;

  const isDeletable =
    dataSource.connectorProvider &&
    CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].isDeletable;

  const selectedPermission: ConnectorPermission = dataSource.connectorProvider
    ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].permissions
        .selected
    : "none";

  const unselectedPermission: ConnectorPermission = dataSource.connectorProvider
    ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].permissions
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

  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const advancedNotionManagement =
    dataSource.connectorProvider === "notion" &&
    featureFlags.includes("advanced_notion_management");

  const getNodeParents = (node: ContentNodeWithParent) => {
    if (node.parentInternalId) {
      return [node.parentInternalId];
    }
    return node.parentInternalIds ?? [];
  };

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
            parents: getNodeParents(r),
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

  const [modalToShow, setModalToShow] = useState<
    | "data_updated"
    | "edition"
    | "selection"
    | "deletion"
    | "private_integration"
    | null
  >(null);

  const { activeSubscription } = useWorkspaceActiveSubscription({
    owner,
    disabled: !isAdmin,
  });
  const plan = activeSubscription ? activeSubscription.plan : null;

  const [saving, setSaving] = useState(false);
  const sendNotification = useSendNotification();
  const { user } = useUser();

  function closeModal(save: boolean) {
    setModalToShow(null);
    onClose(save);
    setTimeout(() => {
      setSelectedNodes({});
    }, 300);
  }

  async function save() {
    if (
      !(await confirmPrivateNodesSync({
        selectedNodes: Object.values(selectedNodes)
          .filter((sn) => sn.isSelected)
          .map((sn) => sn.node),
        confirm,
      }))
    ) {
      return;
    }
    setSaving(true);
    try {
      if (Object.keys(selectedNodes).length) {
        const r = await fetch(
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
          const error: {
            error: {
              type: string;
              message: string;
              connectors_error: { type: string; message: string };
            };
          } = await r.json();
          console.log(JSON.stringify(error, null, 2));
          sendNotification({
            type: "error",
            title: error.error.message,
            description: error.error.connectors_error.message,
          });
        } else {
          void mutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions`
              )
          );

          // Display the data updated modal.
          setModalToShow("data_updated");
        }
      } else {
        closeModal(false);
      }
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Error saving permissions",
        description: "An unexpected error occurred while saving permissions.",
      });
      console.error(e);
    }
    setSaving(false);
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
      setModalToShow("selection");
    } else {
      setModalToShow(null);
    }
  }, [connector.type, isOpen]);

  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connector.type];

  const OptionsComponent = connectorConfiguration.optionsComponent;

  const permissionsConfigurable = getConnectorPermissionsConfigurableBlocked(
    connector.type
  );

  return (
    <>
      {onManageButtonClick && (
        <Button
          size="sm"
          label={`Manage ${getDisplayNameForDataSource(dataSource)}`}
          icon={CloudArrowLeftRightIcon}
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
                  Manage {getDisplayNameForDataSource(dataSource)} connection
                </SheetTitle>
                <div className="flex flex-row justify-end gap-2 py-1">
                  {(isOAuthProvider(connector.type) ||
                    isRemoteDatabase(dataSource)) && (
                    <Button
                      label={
                        !isRemoteDatabase(dataSource)
                          ? "Edit permissions"
                          : "Edit connection"
                      }
                      variant="outline"
                      icon={LockIcon}
                      onClick={() => {
                        setModalToShow("edition");
                      }}
                      disabled={permissionsConfigurable.blocked}
                    />
                  )}
                  {dataSource.connectorProvider === "notion" &&
                    featureFlags.includes("notion_private_integration") && (
                      <Button
                        label="Setup Private Integration"
                        variant="outline"
                        icon={LockIcon}
                        onClick={() => setModalToShow("private_integration")}
                      />
                    )}
                  {isDeletable && (
                    <Button
                      label="Delete connection"
                      variant="warning"
                      icon={TrashIcon}
                      onClick={() => {
                        setModalToShow("deletion");
                      }}
                    />
                  )}
                </div>
              </SheetHeader>

              <SheetContainer>
                <div className="dd-privacy-mask flex w-full flex-col gap-4">
                  {permissionsConfigurable.blocked && (
                    <ContentMessage
                      title="Editing permissions is temporarily disabled"
                      variant="info"
                      icon={InformationCircleIcon}
                    >
                      <ReactMarkdown>
                        {permissionsConfigurable.placeholder ?? ""}
                      </ReactMarkdown>
                    </ContentMessage>
                  )}
                  {OptionsComponent && plan && (
                    <>
                      <div className="heading-xl p-1">Connection options</div>
                      <div className="p-1">
                        <div className="border-y border-border dark:border-border-night">
                          <OptionsComponent
                            {...{ owner, readOnly, isAdmin, dataSource, plan }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {!connectorConfiguration.isResourceSelectionDisabled && (
                    <>
                      <div className="flex items-center justify-between p-1">
                        <div className="heading-xl">
                          {connectorConfiguration.selectLabel}
                        </div>
                      </div>
                      <ContentNodeTree
                        isTitleFilterEnabled={
                          connectorConfiguration.isTitleFilterEnabled &&
                          canUpdatePermissions
                        }
                        isRoundedBackground={true}
                        useResourcesHook={useResourcesHook}
                        selectedNodes={
                          canUpdatePermissions ? selectedNodes : undefined
                        }
                        setSelectedNodes={
                          canUpdatePermissions && !isResourcesLoading
                            ? setSelectedNodes
                            : undefined
                        }
                        showExpand={connectorConfiguration?.isNested}
                      />
                    </>
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
              {!connectorConfiguration.isResourceSelectionDisabled && (
                <SheetFooter
                  leftButtonProps={{
                    label: "Cancel",
                    variant: "outline",
                    onClick: () => closeModal(false),
                  }}
                  rightButtonProps={{
                    label: saving ? "Saving..." : "Save",
                    variant: "primary",
                    disabled: isUnchanged || saving,
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
                    sendNotification
                  );
                  closeModal(false);
                }}
              />
            );
          case "slack_bot":
          case "microsoft_bot":
            return null;
          case "discord_bot":
            return null;
          default:
            assertNever(c.type);
        }
      })}

      <DataSourceDeletionModal
        isOpen={modalToShow === "deletion"}
        onClose={() => closeModal(false)}
        dataSource={dataSource}
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
}: {
  selectedNodes: ContentNode[];
  confirm: (n: ConfirmDataType) => Promise<boolean>;
}): Promise<boolean> {
  // confirmation in case there are private nodes
  const privateNodes = selectedNodes.filter(
    (node) => node.providerVisibility === "private"
  );

  if (privateNodes.length > 0) {
    const warnNodes = privateNodes.slice(0, 3).map((node) => node.title);
    if (privateNodes.length > 3) {
      warnNodes.push(` and ${privateNodes.length - 3} more...`);
    }

    return confirm({
      title: "Sensitive data synchronization",
      message: `You are synchronizing data from private source(s): ${warnNodes.join(", ")}. Is this okay?`,
      validateVariant: "warning",
    });
  }
  return true;
}
