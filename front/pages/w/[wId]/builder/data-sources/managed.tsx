import {
  Avatar,
  BookOpenIcon,
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  ContentMessage,
  DataTable,
  Dialog,
  Hoverable,
  InformationCircleIcon,
  Modal,
  Page,
  PlusIcon,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceType,
  EditedByUser,
  ManageDataSourcesLimitsType,
  Result,
  UserType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { ConnectorType } from "@dust-tt/types";
import {
  ConnectorsAPI,
  Err,
  isOAuthProvider,
  Ok,
  setupOAuthConnection,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import * as React from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { RequestDataSourcesModal } from "@app/components/data_source/RequestDataSourcesModal";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getDataSourceUsage } from "@app/lib/api/agent_data_sources";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAdmins } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type { PostManagedDataSourceRequestBody } from "@app/pages/api/w/[wId]/data_sources/managed";

const { GA_TRACKING_ID = "" } = process.env;

export type DataSourceIntegration = {
  name: string;
  dataSourceName: string | null;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage?: string | null;
  status: "preview" | "built" | "rolling_out";
  rollingOutFlag: WhitelistableFeature | null;
  connectorProvider: ConnectorProvider;
  description: string;
  limitations: string | null;
  guideLink: string | null;
  synchronizedAgo: string | null;
  setupWithSuffix: string | null;
  usage: number | null;
  editedByUser?: EditedByUser | null;
};

type Info = {
  row: {
    original: {
      icon: ComponentType;
      name: string;
      usage: number | null;
      editedByUser?: EditedByUser | null;
      connector: ConnectorType | null;
      workspaceId: string | undefined;
      dataSourceName: string | undefined;
      isLoading: boolean;
      isBuilt: boolean;
      isAdmin: boolean;
      fetchConnectorError: boolean;
      buttonOnClick: () => void;
      upgradeDialog: React.JSX.Element;
      comingSoonDialog: React.JSX.Element;
    };
  };
};

type GetTableRowParams = {
  integration: DataSourceIntegration;
  isAdmin: boolean;
  isLoadingByProvider: Record<ConnectorProvider, boolean | undefined>;
  router: NextRouter;
  owner: WorkspaceType;
  readOnly: boolean;
  plan: PlanType;
  limits: ManageDataSourcesLimitsType;
  showPreviewPopupForProvider: ConnectorProvider | null;
  showUpgradePopupForProvider: ConnectorProvider | null;
  setShowUpgradePopupForProvider: (provider: ConnectorProvider | null) => void;
  setShowConfirmConnection: (integration: DataSourceIntegration | null) => void;
  setShowPreviewPopupForProvider: (provider: ConnectorProvider | null) => void;
};

type ManagedConnector = {
  dataSourceName: string;
  provider: ConnectorProvider;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage: string | null;
  editedByUser?: EditedByUser | null;
  usage: number | null;
};

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
];

export async function setupConnection({
  dustClientFacingUrl,
  owner,
  provider,
}: {
  dustClientFacingUrl: string;
  owner: WorkspaceType;
  provider: ConnectorProvider;
}): Promise<Result<string, Error>> {
  let connectionId: string;

  if (isOAuthProvider(provider)) {
    // OAuth flow
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl,
      owner,
      provider,
      useCase: "connection",
    });
    if (!cRes.isOk()) {
      return cRes;
    }
    connectionId = cRes.value.connection_id;
  } else {
    return new Err(new Error(`Unknown provider ${provider}`));
  }

  return new Ok(connectionId);
}

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  isAdmin: boolean;
  integrations: DataSourceIntegration[];
  plan: PlanType;
  gaTrackingId: string;
  dustClientFacingUrl: string;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!owner || !plan || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();

  const allDataSources = await getDataSources(auth, { includeEditedBy: true });
  const managedDataSources = allDataSources
    .filter((ds) => ds.connectorId)
    .filter((ds) => ds.connectorProvider !== "webcrawler");

  const managedConnector: ManagedConnector[] = await Promise.all(
    managedDataSources.map(async (mds) => {
      if (!mds.connectorId || !mds.connectorProvider) {
        throw new Error(
          // Should never happen, but we need to make eslint happy
          "Unexpected empty `connectorId or `connectorProvider` for managed data sources"
        );
      }
      try {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const statusRes = await connectorsAPI.getConnector(mds.connectorId);
        if (statusRes.isErr()) {
          return {
            dataSourceName: mds.name,
            provider: mds.connectorProvider,
            connector: null,
            fetchConnectorError: true,
            fetchConnectorErrorMessage: statusRes.error.message,
            editedByUser: mds.editedByUser,
            usage: await getDataSourceUsage({
              auth,
              dataSource: mds,
            }),
          };
        }
        return {
          dataSourceName: mds.name,
          provider: mds.connectorProvider,
          connector: statusRes.value,
          fetchConnectorError: false,
          fetchConnectorErrorMessage: null,
          editedByUser: mds.editedByUser,
          usage: await getDataSourceUsage({
            auth,
            dataSource: mds,
          }),
        };
      } catch (e) {
        // Probably means `connectors` is down, we don't fail to avoid a 500 when just displaying
        // the datasources (eventual actions will fail but a 500 just at display is not desirable).
        // When that happens the managed data sources are shown as failed.
        return {
          dataSourceName: mds.name,
          provider: mds.connectorProvider,
          connector: null,
          fetchConnectorError: true,
          fetchConnectorErrorMessage: "Synchonization service is down",
          editedByUser: mds.editedByUser,
          usage: null,
        };
      }
    })
  );

  const integrations: DataSourceIntegration[] = managedConnector.map((mc) => {
    const integration = CONNECTOR_CONFIGURATIONS[mc.provider];
    return {
      name: integration.name,
      connectorProvider: integration.connectorProvider,
      status: integration.status,
      rollingOutFlag: integration.rollingOutFlag || null,
      description: integration.description,
      limitations: integration.limitations,
      guideLink: integration.guideLink,
      dataSourceName: mc.dataSourceName,
      connector: mc.connector,
      fetchConnectorError: mc.fetchConnectorError,
      fetchConnectorErrorMessage: mc.fetchConnectorErrorMessage,
      synchronizedAgo: mc.connector?.lastSyncSuccessfulTime
        ? timeAgoFrom(mc.connector.lastSyncSuccessfulTime)
        : null,
      setupWithSuffix: null,
      editedByUser: mc.editedByUser,
      usage: mc.usage,
    };
  });

  let setupWithSuffix: {
    connector: ConnectorProvider;
    suffix: string;
  } | null = null;
  if (
    context.query.setupWithSuffixConnector &&
    Object.keys(CONNECTOR_CONFIGURATIONS).includes(
      context.query.setupWithSuffixConnector as string
    ) &&
    context.query.setupWithSuffixSuffix &&
    typeof context.query.setupWithSuffixSuffix === "string"
  ) {
    setupWithSuffix = {
      connector: context.query.setupWithSuffixConnector as ConnectorProvider,
      suffix: context.query.setupWithSuffixSuffix,
    };
  }

  for (const key in CONNECTOR_CONFIGURATIONS) {
    if (
      !integrations.find(
        (i) => i.connectorProvider === (key as ConnectorProvider)
      ) ||
      setupWithSuffix?.connector === key
    ) {
      const integration = CONNECTOR_CONFIGURATIONS[key as ConnectorProvider];
      integrations.push({
        name: integration.name,
        connectorProvider: integration.connectorProvider,
        status: integration.status,
        rollingOutFlag: integration.rollingOutFlag || null,
        description: integration.description,
        limitations: integration.limitations,
        guideLink: integration.guideLink,
        dataSourceName: null,
        connector: null,
        fetchConnectorError: false,
        synchronizedAgo: null,
        setupWithSuffix:
          setupWithSuffix?.connector === key ? setupWithSuffix.suffix : null,
        usage: 0,
        editedByUser: null,
      });
    }
  }

  return {
    props: {
      owner,
      user,
      subscription,
      readOnly,
      isAdmin,
      integrations,
      plan,
      gaTrackingId: GA_TRACKING_ID,
      dustClientFacingUrl: config.getClientFacingUrl(),
    },
  };
});

function ConfirmationModal({
  dataSource,
  show,
  onClose,
  onConfirm,
}: {
  dataSource: DataSourceIntegration;
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Modal
      isOpen={show}
      title={`Connect ${dataSource.name}`}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="pt-8">
        <Page.Vertical gap="lg" align="stretch">
          <div className="flex flex-col gap-y-2">
            <div className="grow text-sm font-medium text-element-800">
              Important
            </div>
            <div className="text-sm font-normal text-element-700">
              Resources shared with Dust will be made available to the entire
              workspace{" "}
              <span className="font-medium">
                irrespective of their granular permissions
              </span>{" "}
              on {dataSource.name}.
            </div>
          </div>

          {dataSource.limitations && (
            <div className="flex flex-col gap-y-2">
              <div className="grow text-sm font-medium text-element-800">
                Limitations
              </div>
              <div className="text-sm font-normal text-element-700">
                {dataSource.limitations}
              </div>
            </div>
          )}

          {dataSource.connectorProvider === "google_drive" && (
            <>
              <div className="flex flex-col gap-y-2">
                <div className="grow text-sm font-medium text-element-800">
                  Disclosure
                </div>
                <div className="text-sm font-normal text-element-700">
                  Dust's use of information received from the Google APIs will
                  adhere to{" "}
                  <Link
                    className="s-text-action-500"
                    href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                  >
                    Google API Services User Data Policy
                  </Link>
                  , including the Limited Use requirements.
                </div>
              </div>

              <div className="flex flex-col gap-y-2">
                <div className="grow text-sm font-medium text-element-800">
                  Notice on data processing
                </div>
                <div className="text-sm font-normal text-element-700">
                  By connecting Google Drive, you acknowledge and agree that
                  within your Google Drive, the data contained in the files and
                  folders that you choose to synchronize with Dust will be
                  transmitted to third-party entities, including but not limited
                  to Artificial Intelligence (AI) model providers, for the
                  purpose of processing and analysis. This process is an
                  integral part of the functionality of our service and is
                  subject to the terms outlined in our Privacy Policy and Terms
                  of Service.
                </div>
              </div>
            </>
          )}

          <div className="flex justify-center pt-2">
            <Button.List isWrapping={true}>
              <Button
                variant="primary"
                size="md"
                icon={CloudArrowLeftRightIcon}
                onClick={() => {
                  setIsLoading(true);
                  onConfirm();
                }}
                disabled={isLoading}
                label={
                  isLoading
                    ? "Connecting..."
                    : dataSource.connectorProvider === "google_drive"
                      ? "Acknowledge and Connect"
                      : "Connect"
                }
              />
              {dataSource.guideLink && (
                <Button
                  label="Read our guide"
                  size="md"
                  variant="tertiary"
                  icon={BookOpenIcon}
                  onClick={() => {
                    if (dataSource.guideLink) {
                      window.open(dataSource.guideLink, "_blank");
                    }
                  }}
                />
              )}
            </Button.List>
          </div>
        </Page.Vertical>
      </div>
    </Modal>
  );
}

export default function DataSourcesView({
  owner,
  user,
  subscription,
  readOnly,
  isAdmin,
  integrations,
  plan,
  gaTrackingId,
  dustClientFacingUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useContext(SendNotificationsContext);
  const [dataSourceIntegrations, setDataSourceIntegrations] =
    useState(integrations);
  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Record<ConnectorProvider, boolean | undefined>
  >({} as Record<ConnectorProvider, boolean | undefined>);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [showUpgradePopupForProvider, setShowUpgradePopupForProvider] =
    useState<ConnectorProvider | null>(null);
  const [showPreviewPopupForProvider, setShowPreviewPopupForProvider] =
    useState<ConnectorProvider | null>(null);
  const [showConfirmConnection, setShowConfirmConnection] =
    useState<DataSourceIntegration | null>(null);
  const [isRequestDataSourceModalOpen, setIsRequestDataSourceModalOpen] =
    useState(false);

  const { admins, isAdminsLoading } = useAdmins(owner);
  const planConnectionsLimits = plan.limits.connections;
  const handleEnableManagedDataSource = async (
    provider: ConnectorProvider,
    suffix: string | null
  ) => {
    try {
      const connectionIdRes = await setupConnection({
        dustClientFacingUrl,
        owner,
        provider,
      });
      if (connectionIdRes.isErr()) {
        throw connectionIdRes.error;
      }

      setShowConfirmConnection(null);
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: true }));

      const res = await fetch(
        suffix
          ? `/api/w/${
              owner.sId
            }/data_sources/managed?suffix=${encodeURIComponent(suffix)}`
          : `/api/w/${owner.sId}/data_sources/managed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider,
            connectionId: connectionIdRes.value,
            name: undefined,
            configuration: null,
          } satisfies PostManagedDataSourceRequestBody),
        }
      );

      if (res.ok) {
        const createdManagedDataSource: {
          dataSource: DataSourceType;
          connector: ConnectorType;
        } = await res.json();
        setDataSourceIntegrations((prev) =>
          prev.map((ds) => {
            return ds.connector === null && ds.connectorProvider == provider
              ? {
                  ...ds,
                  connector: createdManagedDataSource.connector,
                  setupWithSuffix: null,
                  dataSourceName: createdManagedDataSource.dataSource.name,
                }
              : ds;
          })
        );
        if (REDIRECT_TO_EDIT_PERMISSIONS.includes(provider)) {
          void router.push(
            `/w/${owner.sId}/builder/data-sources/${createdManagedDataSource.dataSource.name}?edit_permissions=true`
          );
        }
      } else {
        const responseText = await res.text();
        sendNotification({
          type: "error",
          title: `Failed to enable connection (${provider})`,
          description: `Got: ${responseText}`,
        });
      }
    } catch (e) {
      setShowConfirmConnection(null);
      sendNotification({
        type: "error",
        title: `Failed to enable connection (${provider})`,
      });
    } finally {
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: false }));
    }
  };

  useEffect(() => {
    setDataSourceIntegrations(dataSourceIntegrations);
  }, [dataSourceIntegrations]);

  const searchBarRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const connectionRows = useMemo(() => {
    const filteredRows = integrations.filter(
      (ds) =>
        !CONNECTOR_CONFIGURATIONS[ds.connectorProvider].hide &&
        (isAdmin || ds.connector)
    );
    return filteredRows.map((integration) =>
      getTableRow({
        integration,
        isAdmin,
        isLoadingByProvider,
        router,
        owner,
        readOnly,
        plan,
        limits: planConnectionsLimits,
        showPreviewPopupForProvider,
        showUpgradePopupForProvider,
        setShowUpgradePopupForProvider,
        setShowConfirmConnection,
        setShowPreviewPopupForProvider,
      })
    );
  }, [
    integrations,
    isAdmin,
    isLoadingByProvider,
    owner,
    plan,
    planConnectionsLimits,
    readOnly,
    router,
    showPreviewPopupForProvider,
    showUpgradePopupForProvider,
  ]);
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_managed",
      })}
    >
      {!isAdmin && (
        <Modal
          isOpen={showAdminsModal}
          title="Administrators"
          onClose={() => setShowAdminsModal(false)}
          hasChanged={false}
          variant="side-sm"
        >
          <div className="flex flex-col gap-5 pt-6 text-sm text-element-700">
            <Page.SectionHeader
              title="Administrators"
              description={`${owner.name} has the following administrators:`}
            />
            {isAdminsLoading ? (
              <div className="flex animate-pulse items-center justify-center gap-3 border-t border-structure-200 bg-structure-50 py-2 text-xs sm:text-sm">
                <div className="hidden sm:block">
                  <Avatar size="xs" />
                </div>
                <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                  <div className="font-medium text-element-900">Loading...</div>
                  <div className="grow font-normal text-element-700"></div>
                </div>
              </div>
            ) : (
              <div className="s-w-full">
                {admins.map((admin) => {
                  return (
                    <div
                      key={`member-${admin.id}`}
                      className="flex items-center justify-center gap-3 border-t border-structure-200 p-2 text-xs sm:text-sm"
                    >
                      <div className="hidden sm:block">
                        <Avatar
                          visual={admin.image}
                          name={admin.fullName}
                          size="sm"
                        />
                      </div>
                      <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                        <div className="font-medium text-element-900">
                          {admin.fullName}
                        </div>
                        <div className="grow font-normal text-element-700">
                          {admin.email}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
      {showConfirmConnection && (
        <ConfirmationModal
          dataSource={showConfirmConnection}
          show={true}
          onClose={() => setShowConfirmConnection(null)}
          onConfirm={async () => {
            await handleEnableManagedDataSource(
              showConfirmConnection.connectorProvider as ConnectorProvider,
              showConfirmConnection.setupWithSuffix
            );
          }}
        />
      )}
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Connections"
          icon={CloudArrowLeftRightIcon}
          description="Manage connections to your products and the real-time data feeds Dust has access to."
        />
        {!isAdmin && (
          <ContentMessage title="How are connections managed?">
            <b>Workspace administrators</b> control access to connections for
            all members.{" "}
            <Hoverable
              variant="primary"
              onClick={() => setShowAdminsModal(true)}
            >
              View the list of administrators here.
            </Hoverable>
          </ContentMessage>
        )}
        <div className="flex gap-2">
          <Button
            label="Request"
            icon={PlusIcon}
            onClick={() => setIsRequestDataSourceModalOpen(true)}
          />
          <Searchbar
            ref={searchBarRef}
            name="search"
            placeholder="Search (Name)"
            value={dataSourceSearch}
            onChange={(s) => {
              setDataSourceSearch(s);
            }}
          />
        </div>
        <DataTable
          data={connectionRows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"name"}
        />
        <RequestDataSourcesModal
          isOpen={isRequestDataSourceModalOpen}
          onClose={() => setIsRequestDataSourceModalOpen(false)}
          dataSourceIntegrations={dataSourceIntegrations}
          currentUserEmail={user.email}
        />
      </Page.Vertical>
    </AppLayout>
  );
}

function getTableColumns() {
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: Info) => (
        <DataTable.Cell icon={info.row.original.icon}>
          {info.row.original.name}
        </DataTable.Cell>
      ),
    },
    {
      header: "Used by",
      accessorKey: "usage",
      cell: (info: Info) => (
        <>
          {info.row.original.usage ? (
            <DataTable.Cell icon={RobotIcon}>
              {info.row.original.usage}
            </DataTable.Cell>
          ) : null}
        </>
      ),
    },
    {
      header: "Managed by",
      cell: (info: Info) => (
        <DataTable.Cell
          avatarUrl={info.row.original.editedByUser?.imageUrl ?? ""}
        />
      ),
    },
    {
      header: "Last sync",
      accessorKey: "editedByUser.editedAt",
      cell: (info: Info) => (
        <DataTable.Cell className="w-10">
          {(() => {
            if (!info.row.original.connector) {
              return <Chip color="amber">Never</Chip>;
            } else if (info.row.original.fetchConnectorError) {
              return (
                <Chip color="warning">
                  Error loading the connector. Try again in a few minutes.
                </Chip>
              );
            } else {
              return (
                info.row.original.workspaceId &&
                info.row.original.dataSourceName && (
                  <ConnectorSyncingChip
                    initialState={info.row.original.connector}
                    workspaceId={info.row.original.workspaceId}
                    dataSourceName={info.row.original.dataSourceName}
                  />
                )
              );
            }
          })()}
        </DataTable.Cell>
      ),
    },
    {
      header: "Manage",
      cell: (info: Info) => {
        const original = info.row.original;
        const disabled =
          original.isLoading || (!original.isBuilt && !original.isAdmin);

        if (!original.connector) {
          return (
            <DataTable.Cell>
              <Button
                variant="primary"
                icon={
                  original.isBuilt
                    ? CloudArrowLeftRightIcon
                    : InformationCircleIcon
                }
                disabled={disabled}
                onClick={original.buttonOnClick}
                label={
                  original.isBuilt
                    ? original.isLoading
                      ? "Connecting..."
                      : "Connect"
                    : "Preview"
                }
              />
            </DataTable.Cell>
          );
        } else {
          return (
            <DataTable.Cell className="relative">
              <Button
                variant="secondary"
                icon={Cog6ToothIcon}
                disabled={disabled}
                onClick={original.buttonOnClick}
                label={original.isAdmin ? "Manage" : "View"}
              />
              {original.upgradeDialog}
              {original.comingSoonDialog}
            </DataTable.Cell>
          );
        }
      },
    },
  ];
}

function getTableRow({
  integration,
  isAdmin,
  isLoadingByProvider,
  router,
  owner,
  readOnly,
  plan,
  limits,
  showPreviewPopupForProvider,
  showUpgradePopupForProvider,
  setShowUpgradePopupForProvider,
  setShowConfirmConnection,
  setShowPreviewPopupForProvider,
}: GetTableRowParams) {
  const connectorProvider = integration.connectorProvider as ConnectorProvider;

  const isBuilt =
    integration.status === "built" ||
    (integration.status === "rolling_out" &&
      !!integration.rollingOutFlag &&
      owner.flags.includes(integration.rollingOutFlag));
  const isDisabled = isLoadingByProvider[connectorProvider] || !isAdmin;
  const isProviderAllowed = isConnectorProviderAllowed(
    integration.connectorProvider,
    limits
  );

  const buttonOnClick = () => {
    if (!integration || !integration.connector) {
      if (!isProviderAllowed) {
        setShowUpgradePopupForProvider(connectorProvider);
      } else {
        if (isBuilt) {
          setShowConfirmConnection(integration);
        } else {
          setShowPreviewPopupForProvider(connectorProvider);
        }
      }
    } else {
      !isDisabled
        ? void router.push(
            `/w/${owner.sId}/builder/data-sources/${integration.dataSourceName}`
          )
        : null;
    }
  };

  const upgradeDialog = (
    <Dialog
      isOpen={showUpgradePopupForProvider === connectorProvider}
      onCancel={() => setShowUpgradePopupForProvider(null)}
      title={`${plan.name} plan`}
      onValidate={() => {
        void router.push(`/w/${owner.sId}/subscription`);
      }}
    >
      <p>Unlock this managed data source by upgrading your plan.</p>
    </Dialog>
  );

  const comingSoonDialog = (
    <Dialog
      isOpen={showPreviewPopupForProvider === connectorProvider}
      title="Coming Soon!"
      validateLabel="Contact us"
      onValidate={() => {
        window.open(
          `mailto:support@dust.tt?subject=Early access to the ${integration.name} connection`
        );
      }}
      onCancel={() => {
        setShowPreviewPopupForProvider(null);
      }}
    >
      Please email us at support@dust.tt for early access.
    </Dialog>
  );

  const LogoComponent =
    CONNECTOR_CONFIGURATIONS[connectorProvider].logoComponent;

  return {
    ...integration,
    icon: LogoComponent,
    buttonOnClick,
    workspaceId: integration.connector?.workspaceId,
    dataSourceName: integration.connector?.dataSourceName,
    dataSourceUrl: `/w/${owner.sId}/builder/data-sources/${integration.dataSourceName}`,
    isAdmin,
    readOnly,
    isBuilt,
    disabled: isDisabled,
    isLoading: isLoadingByProvider[connectorProvider] ?? false,
    upgradeDialog,
    comingSoonDialog,
  };
}

function isConnectorProviderAllowed(
  provider: ConnectorProvider,
  limits: ManageDataSourcesLimitsType
): boolean {
  switch (provider) {
    case "confluence": {
      return limits.isConfluenceAllowed;
    }
    case "slack": {
      return limits.isSlackAllowed;
    }
    case "notion": {
      return limits.isNotionAllowed;
    }
    case "github": {
      return limits.isGithubAllowed;
    }
    case "google_drive": {
      return limits.isGoogleDriveAllowed;
    }
    case "intercom": {
      return limits.isIntercomAllowed;
    }
    case "microsoft": {
      return true;
    }
    case "webcrawler": {
      return false;
    }
    default:
      throw new Error(`Unknown connector provider ${provider}`);
  }
}
