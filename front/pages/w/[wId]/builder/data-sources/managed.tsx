import {
  Button,
  Chip,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  DataTable,
  Page,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  LightWorkspaceType,
  PlanType,
  Result,
  SubscriptionType,
  UpdateConnectorRequestBody,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { CONNECTOR_TYPE_TO_MISMATCH_ERROR } from "@dust-tt/types";
import {
  CONNECTOR_PROVIDERS,
  Err,
  isConnectorProvider,
  isOAuthProvider,
  Ok,
  removeNulls,
  setupOAuthConnection,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  ConnectorPermissionsModal,
  getRenderingConfigForConnectorProvider,
} from "@app/components/ConnectorPermissionsModal";
import { DataSourceEditionModal } from "@app/components/data_source/DataSourceEditionModal";
import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { AddConnectionMenu } from "@app/components/vaults/AddConnectionMenu";
import config from "@app/lib/api/config";
import {
  augmentDataSourceWithConnectorDetails,
  getDataSources,
} from "@app/lib/api/data_sources";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { isManaged } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

const REDIRECT_TO_EDIT_PERMISSIONS = [
  "confluence",
  "google_drive",
  "microsoft",
  "slack",
  "intercom",
];

type DataSourceWithConnectorAndUsageType =
  DataSourceWithConnectorDetailsType & {
    usage: number | null;
  };

type DataSourceIntegration = {
  connectorProvider: ConnectorProvider;
  setupWithSuffix: string | null;
};

type RowData = {
  isAdmin: boolean;
  managedDataSource: DataSourceWithConnectorAndUsageType;
  disabled: boolean;
  isLoading: boolean;
  readOnly: boolean;
  workspaceId: string | undefined;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  buttonOnClick: () => void;
  onClick?: () => void;
};

type GetTableRowParams = {
  managedDataSource: DataSourceWithConnectorAndUsageType;
  isAdmin: boolean;
  isLoadingByProvider: Record<ConnectorProvider, boolean | undefined>;
  readOnly: boolean;
  onButtonClick: (ds: DataSourceWithConnectorAndUsageType) => void;
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
  managedDataSources: DataSourceWithConnectorAndUsageType[];
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

  const managedDataSources: DataSourceWithConnectorAndUsageType[] = removeNulls(
    await Promise.all(
      allDataSources.map(async (managedDataSource) => {
        const ds = managedDataSource.toJSON();
        if (!isManaged(ds)) {
          return null;
        }
        const augmentedDataSource =
          await augmentDataSourceWithConnectorDetails(ds);

        const usageRes = await managedDataSource.getUsagesByAgents(auth);
        return {
          ...augmentedDataSource,
          usage: usageRes.isOk() ? usageRes.value : 0,
        };
      })
    )
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
      gaTrackingId: config.getGaTrackingId(),
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
  managedDataSources,
  integrations,
  plan,
  gaTrackingId,
  dustClientFacingUrl,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isLoadingByProvider, setIsLoadingByProvider] = useState(
    {} as Record<ConnectorProvider, boolean>
  );
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceWithConnectorAndUsageType | null>(null);
  const [showEditionModal, setShowEditionModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);

  const searchBarRef = useRef<HTMLInputElement>(null);
  const sendNotification = useContext(SendNotificationsContext);
  const router = useRouter();

  useEffect(() => {
    const dataSource = managedDataSources.find(
      (ds) => ds.name === router.query.edit_permissions
    );
    if (dataSource) {
      setSelectedDataSource(dataSource);
      setShowConnectorModal(true);
    }
  }, [router, managedDataSources]);

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
        readOnly,
        onButtonClick: (dataSource: DataSourceWithConnectorAndUsageType) => {
          setSelectedDataSource(dataSource);
          const { addDataWithConnection } =
            getRenderingConfigForConnectorProvider(
              dataSource.connectorProvider
            );
          if (addDataWithConnection) {
            setShowEditionModal(addDataWithConnection);
          } else {
            setShowConnectorModal(true);
          }
        },
      })
    );
  }, [isAdmin, isLoadingByProvider, readOnly, managedDataSources]);

  const updateConnectorConnectionId = async (
    newConnectionId: string,
    provider: string,
    dataSource: DataSourceType
  ) => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/update`,
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
        error: CONNECTOR_TYPE_TO_MISMATCH_ERROR[provider as ConnectorProvider],
      };
    }
    return {
      success: false,
      error: `Failed to update the permissions of the Data Source: (contact support@dust.tt for assistance)`,
    };
  };

  const handleUpdatePermissions = async (
    connector: ConnectorType,
    dataSource: DataSourceType
  ) => {
    const provider = connector.type;

    const connectionIdRes = await setupConnection({
      dustClientFacingUrl,
      owner,
      provider,
    });
    if (connectionIdRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to update the permissions of the Data Source",
        description: connectionIdRes.error.message,
      });
      return;
    }

    const updateRes = await updateConnectorConnectionId(
      connectionIdRes.value,
      provider,
      dataSource
    );
    if (updateRes.error) {
      sendNotification({
        type: "error",
        title: "Failed to update the permissions of the Data Source",
        description: updateRes.error,
      });
      return;
    }
  };
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
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Connections"
          icon={CloudArrowLeftRightIcon}
          description="Manage connections to your products and the real-time data feeds Dust has access to."
        />
        <div
          className={classNames(
            "flex gap-2",
            connectionRows.length === 0 && isAdmin
              ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
              : ""
          )}
        >
          {!isAdmin && (
            <RequestDataSourceModal
              dataSources={managedDataSources}
              owner={owner}
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
              existingDataSources={managedDataSources}
              dustClientFacingUrl={dustClientFacingUrl}
              setIsProviderLoading={(provider, isLoading) =>
                setIsLoadingByProvider((prev) => ({
                  ...prev,
                  [provider]: isLoading,
                }))
              }
              onCreated={async (dataSource) => {
                if (
                  dataSource.connectorProvider &&
                  REDIRECT_TO_EDIT_PERMISSIONS.includes(
                    dataSource.connectorProvider
                  )
                ) {
                  await router.replace(
                    `${router.asPath}?edit_permissions=${dataSource.name}`
                  );
                } else {
                  await router.replace(`${router.asPath}`);
                }
              }}
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
          false
        )}
        {selectedDataSource && selectedDataSource.connector && (
          <>
            <ConnectorPermissionsModal
              owner={owner}
              connector={selectedDataSource.connector}
              dataSource={selectedDataSource}
              isOpen={showConnectorModal && !!selectedDataSource}
              onClose={() => {
                setShowConnectorModal(false);
              }}
              setShowEditionModal={setShowEditionModal}
              handleUpdatePermissions={handleUpdatePermissions}
              isAdmin={isAdmin}
              readOnly={readOnly}
              plan={plan}
            />
            <DataSourceEditionModal
              isOpen={showEditionModal}
              onClose={() => setShowEditionModal(false)}
              dataSource={selectedDataSource}
              owner={owner}
              user={user}
              onEditPermissionsClick={() => {
                if (!selectedDataSource.connector) {
                  return;
                }
                void handleUpdatePermissions(
                  selectedDataSource.connector,
                  selectedDataSource
                );
              }}
              dustClientFacingUrl={dustClientFacingUrl}
            />
          </>
        )}
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
                    dataSourceId={managedDataSource.sId}
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
  readOnly,
  onButtonClick,
}: GetTableRowParams): RowData {
  const connectorProvider =
    managedDataSource.connectorProvider as ConnectorProvider;
  const isDisabled = isLoadingByProvider[connectorProvider] || !isAdmin;

  const buttonOnClick = () => {
    !isDisabled ? onButtonClick(managedDataSource) : null;
  };

  const LogoComponent =
    CONNECTOR_CONFIGURATIONS[connectorProvider].logoComponent;

  return {
    managedDataSource,
    icon: LogoComponent,
    buttonOnClick,
    workspaceId: managedDataSource.connector?.workspaceId,
    isAdmin,
    readOnly,
    disabled: isDisabled,
    isLoading: isLoadingByProvider[connectorProvider] ?? false,
  };
}
