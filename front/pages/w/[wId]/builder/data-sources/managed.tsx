import {
  Avatar,
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  ContentMessage,
  DataTable,
  Dialog,
  DropdownMenu,
  Hoverable,
  Modal,
  Page,
  PlusIcon,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  EditedByUser,
  ManageDataSourcesLimitsType,
  Result,
  UserType,
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
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import { useRef } from "react";
import { useEffect, useMemo, useState } from "react";
import * as React from "react";

import type { DataSourceIntegration } from "@app/components/data_source/DataSourceEdition";
import { DataSourceEditionModal } from "@app/components/data_source/DataSourceEdition";
import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { RequestDataSourcesModal } from "@app/components/data_source/RequestDataSourcesModal";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getDataSourceUsage } from "@app/lib/api/agent_data_sources";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAdmins } from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";

const { GA_TRACKING_ID = "" } = process.env;

type RowData = DataSourceIntegration & {
  isAdmin: boolean;
  disabled: boolean;
  isLoading: boolean;
  readOnly: boolean;
  dataSourceUrl: string;
  workspaceId: string | undefined;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  buttonOnClick: () => void;
  onClick?: () => void;
  onMoreClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

type GetTableRowParams = {
  integration: DataSourceIntegration;
  isAdmin: boolean;
  isLoadingByProvider: Record<ConnectorProvider, boolean | undefined>;
  onClick: () => void;
  owner: WorkspaceType;
  readOnly: boolean;
};

type ShowIntegration = {
  show: boolean;
  dataSourceIntegration: DataSourceIntegration | null;
};

type HandleConnectionClickParams = {
  integration: DataSourceIntegration;
  isAdmin: boolean;
  isLoadingByProvider: Record<ConnectorProvider, boolean | undefined>;
  router: NextRouter;
  owner: WorkspaceType;
  limits: ManageDataSourcesLimitsType;
  setShowUpgradePopup: (show: boolean) => void;
  setShowEditionDataSourceModalOpen: (showIntegration: ShowIntegration) => void;
  setShowPreviewPopupForProvider: (providerPreview: {
    show: boolean;
    connector: ConnectorProvider | null;
  }) => void;
};

type ManagedSourceType = {
  dataSourceName: string;
  provider: ConnectorProvider;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage: string | null;
  editedByUser?: EditedByUser | null;
  usage: number | null;
};

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

  const managedSources: ManagedSourceType[] = await Promise.all(
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

  const integrations: DataSourceIntegration[] = managedSources.map((mc) => {
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
      subscription,
      readOnly,
      isAdmin,
      integrations,
      plan,
      gaTrackingId: GA_TRACKING_ID,
      dustClientFacingUrl: config.getClientFacingUrl(),
      user,
    },
  };
});

export default function DataSourcesView({
  owner,
  subscription,
  readOnly,
  isAdmin,
  integrations,
  plan,
  gaTrackingId,
  dustClientFacingUrl,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [dataSourceIntegrations, setDataSourceIntegrations] =
    useState(integrations);
  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Record<ConnectorProvider, boolean | undefined>
  >({} as Record<ConnectorProvider, boolean | undefined>);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [showUpgradePopup, setShowUpgradePopup] = useState<boolean>(false);
  const [showPreviewPopupForProvider, setShowPreviewPopupForProvider] =
    useState<{ show: boolean; connector: ConnectorProvider | null }>({
      show: false,
      connector: null,
    });

  const [showEditionDataSourceModalOpen, setShowEditionDataSourceModalOpen] =
    useState<ShowIntegration>({
      show: false,
      dataSourceIntegration: null,
    });
  const [isRequestDataSourceModalOpen, setIsRequestDataSourceModalOpen] =
    useState(false);

  const { admins, isAdminsLoading } = useAdmins(owner);
  const planConnectionsLimits = plan.limits.connections;

  useEffect(() => {
    setDataSourceIntegrations(dataSourceIntegrations);
  }, [dataSourceIntegrations]);

  const searchBarRef = useRef<HTMLInputElement>(null);

  const router = useRouter();

  const [setUpIntegrations, nonSetUpIntegrations] = useMemo(() => {
    return integrations.reduce(
      ([setUpIntegrations, nonSetUpIntegrations], integration) => {
        if (integration.connector) {
          setUpIntegrations.push(integration);
        } else if (integration.connectorProvider !== "webcrawler") {
          nonSetUpIntegrations.push(integration);
        }
        return [setUpIntegrations, nonSetUpIntegrations];
      },
      [[] as DataSourceIntegration[], [] as DataSourceIntegration[]]
    );
  }, [integrations]);

  const connectionRows = useMemo(() => {
    const filteredRows = setUpIntegrations.filter(
      (ds) =>
        !CONNECTOR_CONFIGURATIONS[ds.connectorProvider].hide &&
        (isAdmin || ds.connector)
    );
    return filteredRows.map((integration) =>
      getTableRow({
        integration,
        isAdmin,
        isLoadingByProvider,
        owner,
        readOnly,
        onClick: () => {
          setShowEditionDataSourceModalOpen({
            show: true,
            dataSourceIntegration: integration,
          });
        },
      })
    );
  }, [isAdmin, isLoadingByProvider, owner, readOnly, setUpIntegrations]);
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
        <div
          className={classNames(
            "flex gap-2",
            connectionRows.length === 0 && isAdmin
              ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
              : ""
          )}
        >
          {!isAdmin && (
            <Button
              label="Request"
              icon={PlusIcon}
              onClick={() => setIsRequestDataSourceModalOpen(true)}
            />
          )}
          {connectionRows.length > 0 && (
            <Searchbar
              ref={searchBarRef}
              name="search"
              placeholder="Search (Name)"
              value={dataSourceSearch}
              onChange={(s) => {
                setDataSourceSearch(s);
              }}
            />
          )}

          {isAdmin && nonSetUpIntegrations.length > 0 && (
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  label="Add Connection"
                  variant="primary"
                  icon={CloudArrowLeftRightIcon}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items width={180}>
                {nonSetUpIntegrations.map((integration) => (
                  <DropdownMenu.Item
                    key={integration.dataSourceName}
                    label={integration.name}
                    icon={
                      CONNECTOR_CONFIGURATIONS[integration.connectorProvider]
                        .logoComponent
                    }
                    onClick={() => {
                      handleConnectionClick({
                        integration,
                        isAdmin,
                        isLoadingByProvider,
                        router,
                        owner,
                        limits: planConnectionsLimits,
                        setShowUpgradePopup,
                        setShowEditionDataSourceModalOpen,
                        setShowPreviewPopupForProvider,
                      });
                    }}
                  />
                ))}
              </DropdownMenu.Items>
            </DropdownMenu>
          )}
        </div>
        {connectionRows.length > 0 ? (
          <DataTable
            data={connectionRows}
            columns={getTableColumns()}
            filter={dataSourceSearch}
            filterColumn={"name"}
          />
        ) : !isAdmin ? (
          <div className="flex items-center justify-center text-sm font-normal text-element-700">
            No available connection
          </div>
        ) : (
          <></>
        )}
        <RequestDataSourcesModal
          isOpen={isRequestDataSourceModalOpen}
          onClose={() => setIsRequestDataSourceModalOpen(false)}
          dataSourceIntegrations={dataSourceIntegrations}
          owner={owner}
        />
        <DataSourceEditionModal
          isOpen={showEditionDataSourceModalOpen.show}
          connectorProvider={
            showEditionDataSourceModalOpen.dataSourceIntegration
              ?.connectorProvider
          }
          onClose={() =>
            setShowEditionDataSourceModalOpen({
              show: false,
              dataSourceIntegration: null,
            })
          }
          dataSourceIntegration={
            showEditionDataSourceModalOpen.dataSourceIntegration
          }
          owner={owner}
          router={router}
          dustClientFacingUrl={dustClientFacingUrl}
          user={user}
          setIsRequestDataSourceModalOpen={setIsRequestDataSourceModalOpen}
          setDataSourceIntegrations={setDataSourceIntegrations}
          setIsLoadingByProvider={setIsLoadingByProvider}
        />
      </Page.Vertical>
      {showUpgradePopup && (
        <Dialog
          isOpen={showUpgradePopup}
          onCancel={() => setShowUpgradePopup(false)}
          title={`${plan.name} plan`}
          onValidate={() => {
            void router.push(`/w/${owner.sId}/subscription`);
          }}
        >
          <p>Unlock this managed data source by upgrading your plan.</p>
        </Dialog>
      )}
      {showPreviewPopupForProvider && (
        <Dialog
          isOpen={showPreviewPopupForProvider.show}
          title="Coming Soon!"
          validateLabel="Contact us"
          onValidate={() => {
            window.open(
              `mailto:support@dust.tt?subject=Early access to the ${showPreviewPopupForProvider.connector} connection`
            );
          }}
          onCancel={() => {
            setShowPreviewPopupForProvider({
              show: false,
              connector: null,
            });
          }}
        >
          Please email us at support@dust.tt for early access.
        </Dialog>
      )}
    </AppLayout>
  );
}

function getTableColumns(): ColumnDef<RowData, unknown>[] {
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
        const disabled = original.isLoading || !original.isAdmin;

        if (!original.connector) {
          return (
            <DataTable.Cell>
              <Button
                variant="primary"
                icon={CloudArrowLeftRightIcon}
                disabled={disabled}
                onClick={original.buttonOnClick}
                label={original.isLoading ? "Connecting..." : "Connect"}
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
  owner,
  readOnly,
  onClick,
}: GetTableRowParams): RowData {
  const connectorProvider = integration.connectorProvider as ConnectorProvider;
  const isDisabled = isLoadingByProvider[connectorProvider] || !isAdmin;

  const buttonOnClick = () => {
    !isDisabled ? onClick() : null;
  };

  const LogoComponent =
    CONNECTOR_CONFIGURATIONS[connectorProvider].logoComponent;

  return {
    ...integration,
    icon: LogoComponent,
    buttonOnClick,
    workspaceId: integration.connector?.workspaceId,
    dataSourceName: integration.connector?.dataSourceName ?? null,
    dataSourceUrl: `/w/${owner.sId}/builder/data-sources/${integration.dataSourceName}`,
    isAdmin,
    readOnly,
    disabled: isDisabled,
    isLoading: isLoadingByProvider[connectorProvider] ?? false,
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

function handleConnectionClick({
  integration,
  limits,
  isAdmin,
  isLoadingByProvider,
  setShowUpgradePopup,
  setShowEditionDataSourceModalOpen,
  setShowPreviewPopupForProvider,
  router,
  owner,
}: HandleConnectionClickParams) {
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
  if (!integration || !integration.connector) {
    if (!isProviderAllowed) {
      setShowUpgradePopup(true);
    } else {
      if (isBuilt) {
        setShowEditionDataSourceModalOpen({
          show: true,
          dataSourceIntegration: integration,
        });
      } else {
        setShowPreviewPopupForProvider({
          show: true,
          connector: connectorProvider,
        });
      }
    }
  } else {
    !isDisabled
      ? void router.push(
          `/w/${owner.sId}/builder/data-sources/${integration.dataSourceName}`
        )
      : null;
  }
}
