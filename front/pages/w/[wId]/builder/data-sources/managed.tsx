import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  ContentMessage,
  DataTable,
  Hoverable,
  Page,
  PlusIcon,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  LightWorkspaceType,
  PlanType,
  Result,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CONNECTOR_PROVIDERS,
  ConnectorsAPI,
  Err,
  isConnectorProvider,
  isManaged,
  isOAuthProvider,
  Ok,
  setupOAuthConnection,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import * as React from "react";
import { useMemo, useRef, useState } from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { RequestDataSourcesModal } from "@app/components/data_source/RequestDataSourcesModal";
import { ShowAdmininistratorsModal } from "@app/components/data_source/ShowAdmininistratorsModal";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AddConnectionMenu } from "@app/components/vaults/AddConnectionMenu";
import { getDataSourceUsage } from "@app/lib/api/agent_data_sources";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";

const { GA_TRACKING_ID = "" } = process.env;

type ManagedDataSourceType = DataSourceType & {
  connectorProvider: ConnectorProvider;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  fetchConnectorErrorMessage: string | null;
  usage: number | null;
};

type DataSourceIntegration = {
  connectorProvider: ConnectorProvider;
  setupWithSuffix: string | null;
};

type RowData = {
  isAdmin: boolean;
  managedDataSource: ManagedDataSourceType;
  disabled: boolean;
  isLoading: boolean;
  readOnly: boolean;
  dataSourceUrl: string;
  workspaceId: string | undefined;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  buttonOnClick: () => void;
  onClick?: () => void;
};

type GetTableRowParams = {
  managedDataSource: ManagedDataSourceType;
  isAdmin: boolean;
  isLoadingByProvider: Record<ConnectorProvider, boolean | undefined>;
  router: NextRouter;
  owner: WorkspaceType;
  readOnly: boolean;
};

export async function setupConnection({
  dustClientFacingUrl,
  owner,
  provider,
}: {
  dustClientFacingUrl: string;
  owner: LightWorkspaceType;
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
  managedDataSources: ManagedDataSourceType[];
  plan: PlanType;
  gaTrackingId: string;
  dustClientFacingUrl: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();

  if (!owner || !plan || !subscription) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();

  const allDataSources = await getDataSources(auth, { includeEditedBy: true });

  const managedDataSources: ManagedDataSourceType[] = await Promise.all(
    allDataSources
      .filter((ds) => isManaged(ds))
      .map(async (managedDataSource) => {
        if (
          !managedDataSource.connectorId ||
          !managedDataSource.connectorProvider
        ) {
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
          const statusRes = await connectorsAPI.getConnector(
            managedDataSource.connectorId
          );
          if (statusRes.isErr()) {
            return {
              ...managedDataSource,
              connectorProvider: managedDataSource.connectorProvider,
              connector: null,
              fetchConnectorError: true,
              fetchConnectorErrorMessage: statusRes.error.message,
              usage: 0,
            };
          }
          const usageRes = await getDataSourceUsage({
            auth,
            dataSource: managedDataSource,
          });
          return {
            ...managedDataSource,
            connectorProvider: managedDataSource.connectorProvider,
            connector: statusRes.value,
            fetchConnectorError: false,
            fetchConnectorErrorMessage: null,
            usage: usageRes.isOk() ? usageRes.value : 0,
          };
        } catch (e) {
          // Probably means `connectors` is down, we don't fail to avoid a 500 when just displaying
          // the datasources (eventual actions will fail but a 500 just at display is not desirable).
          // When that happens the managed data sources are shown as failed.
          return {
            ...managedDataSource,
            connectorProvider: managedDataSource.connectorProvider,
            connector: null,
            fetchConnectorError: true,
            fetchConnectorErrorMessage: "Synchonization service is down",
            usage: null,
          };
        }
      })
  );

  let setupWithSuffix: {
    connector: ConnectorProvider;
    suffix: string;
  } | null = null;
  if (
    context.query.setupWithSuffixConnector &&
    isConnectorProvider(context.query.setupWithSuffixConnector as string) &&
    context.query.setupWithSuffixSuffix &&
    typeof context.query.setupWithSuffixSuffix === "string"
  ) {
    setupWithSuffix = {
      connector: context.query.setupWithSuffixConnector as ConnectorProvider,
      suffix: context.query.setupWithSuffixSuffix,
    };
  }

  const integrations: DataSourceIntegration[] = [];
  for (const connectorProvider of CONNECTOR_PROVIDERS) {
    if (
      !managedDataSources.find(
        (i) => i.connectorProvider === connectorProvider
      ) ||
      setupWithSuffix?.connector === connectorProvider
    ) {
      integrations.push({
        connectorProvider: connectorProvider,
        setupWithSuffix:
          setupWithSuffix?.connector === connectorProvider
            ? setupWithSuffix.suffix
            : null,
      });
    }
  }

  return {
    props: {
      owner,
      subscription,
      readOnly,
      isAdmin,
      managedDataSources,
      integrations,
      plan,
      gaTrackingId: GA_TRACKING_ID,
      dustClientFacingUrl: config.getClientFacingUrl(),
    },
  };
});

export default function DataSourcesView({
  owner,
  subscription,
  readOnly,
  isAdmin,
  managedDataSources,
  integrations,
  plan,
  gaTrackingId,
  dustClientFacingUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isLoadingByProvider, setIsLoadingByProvider] = useState(
    {} as Record<ConnectorProvider, boolean>
  );
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [isRequestDataSourceModalOpen, setIsRequestDataSourceModalOpen] =
    useState(false);

  const searchBarRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const connectionRows = useMemo(() => {
    const filteredRows = managedDataSources.filter(
      (ds) =>
        !CONNECTOR_CONFIGURATIONS[ds.connectorProvider].hide &&
        (isAdmin || ds.connector)
    );
    return filteredRows.map((managedDataSource) =>
      getTableRow({
        managedDataSource,
        isAdmin,
        isLoadingByProvider,
        router,
        owner,
        readOnly,
      })
    );
  }, [
    isAdmin,
    isLoadingByProvider,
    owner,
    readOnly,
    router,
    managedDataSources,
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
        <ShowAdmininistratorsModal
          isOpen={showAdminsModal}
          onClose={() => setShowAdminsModal(false)}
          owner={owner}
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
            <div className="hidden w-full sm:block">
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
          )}

          {isAdmin && integrations.length > 0 && (
            <AddConnectionMenu
              owner={owner}
              plan={plan}
              isAdmin={isAdmin}
              existingDataSources={managedDataSources}
              dustClientFacingUrl={dustClientFacingUrl}
              isLoadingByProvider={isLoadingByProvider}
              setIsProviderLoading={(provider, isLoading) =>
                setIsLoadingByProvider((prev) => ({
                  ...prev,
                  [provider]: isLoading,
                }))
              }
            />
          )}
        </div>
        {connectionRows.length > 0 ? (
          <DataTable
            data={connectionRows}
            columns={getTableColumns()}
            filter={dataSourceSearch}
            filterColumn={"name"}
            columnsBreakpoints={{
              // "managedBy": "sm",
              usedBy: "sm",
              lastSync: "sm",
            }}
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
          dataSources={managedDataSources}
          owner={owner}
        />
      </Page.Vertical>
    </AppLayout>
  );
}

function getTableColumns() {
  return [
    {
      header: "Name",
      accessorFn: (row: RowData) =>
        CONNECTOR_CONFIGURATIONS[row.managedDataSource.connectorProvider].name,
      id: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          {info.getValue()}
        </DataTable.CellContent>
      ),
    },
    {
      header: "Used by",
      accessorKey: "managedDataSource.usage",
      cell: (info: CellContext<RowData, number | null>) => (
        <>
          {info.getValue() ? (
            <DataTable.CellContent icon={RobotIcon}>
              {info.getValue()}
            </DataTable.CellContent>
          ) : null}
        </>
      ),
    },
    {
      header: "Managed by",
      accessorFn: (row: RowData) =>
        row.managedDataSource.editedByUser?.imageUrl ?? "",
      id: "managedBy",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent
          avatarUrl={info.getValue()}
          roundedAvatar={true}
        />
      ),
    },
    {
      header: "Last sync",
      accessorFn: (row: RowData) =>
        row.managedDataSource.connector?.lastSyncSuccessfulTime,
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.CellContent className="pr-2">
          {(() => {
            const managedDataSource = info.row.original.managedDataSource;
            if (!managedDataSource.connector) {
              return <Chip color="amber">Never</Chip>;
            } else if (managedDataSource.fetchConnectorError) {
              return (
                <Chip color="warning">
                  Error loading the connector. Try again in a few minutes.
                </Chip>
              );
            } else {
              return (
                info.row.original.workspaceId &&
                managedDataSource.name && (
                  <ConnectorSyncingChip
                    initialState={managedDataSource.connector}
                    workspaceId={info.row.original.workspaceId}
                    dataSourceName={managedDataSource.name}
                  />
                )
              );
            }
          })()}
        </DataTable.CellContent>
      ),
    },
    {
      id: "action",
      cell: (info: CellContext<RowData, unknown>) => {
        const original = info.row.original;
        const disabled = original.isLoading || !original.isAdmin;

        if (!original.managedDataSource.connector) {
          return (
            <DataTable.CellContent>
              <Button
                variant="primary"
                icon={CloudArrowLeftRightIcon}
                disabled={disabled}
                onClick={original.buttonOnClick}
                label={original.isLoading ? "Connecting..." : "Connect"}
              />
            </DataTable.CellContent>
          );
        } else {
          return (
            <DataTable.CellContent>
              <Button
                variant="secondary"
                icon={Cog6ToothIcon}
                disabled={disabled}
                onClick={original.buttonOnClick}
                label={original.isAdmin ? "Manage" : "View"}
              />
            </DataTable.CellContent>
          );
        }
      },
    },
  ];
}

function getTableRow({
  managedDataSource,
  isAdmin,
  isLoadingByProvider,
  router,
  owner,
  readOnly,
}: GetTableRowParams): RowData {
  const connectorProvider =
    managedDataSource.connectorProvider as ConnectorProvider;
  const isDisabled = isLoadingByProvider[connectorProvider] || !isAdmin;

  const buttonOnClick = () => {
    !isDisabled
      ? void router.push(
          `/w/${owner.sId}/builder/data-sources/${managedDataSource.name}`
        )
      : null;
  };

  const LogoComponent =
    CONNECTOR_CONFIGURATIONS[connectorProvider].logoComponent;

  return {
    managedDataSource,
    icon: LogoComponent,
    buttonOnClick,
    workspaceId: managedDataSource.connector?.workspaceId,
    dataSourceUrl: `/w/${owner.sId}/builder/data-sources/${managedDataSource.name}`,
    isAdmin,
    readOnly,
    disabled: isDisabled,
    isLoading: isLoadingByProvider[connectorProvider] ?? false,
  };
}
