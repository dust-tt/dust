import {
  Button,
  CloudArrowDownIcon,
  CloudArrowLeftRightIcon,
  Cog6ToothIcon,
  DropdownMenu,
  PageHeader,
  PlusIcon,
  SectionHeader,
} from "@dust-tt/sparkle";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { buildConnectionId } from "@app/lib/connector_connection_id";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  connectorIsUsingNango,
  ConnectorProvider,
  ConnectorsAPI,
  ConnectorType,
} from "@app/lib/connectors_api";
import { githubAuth } from "@app/lib/github_auth";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const {
  GA_TRACKING_ID = "",
  NANGO_SLACK_CONNECTOR_ID = "",
  NANGO_NOTION_CONNECTOR_ID = "",
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "",
  NANGO_PUBLIC_KEY = "",
  GITHUB_APP_URL = "",
} = process.env;

type DataSourceIntegration = {
  name: string;
  dataSourceName: string | null;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  isBuilt: boolean;
  connectorProvider: ConnectorProvider;
  logoPath: string;
  description: string;
  synchronizedAgo: string | null;
  setupWithSuffix: string | null;
};

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSources: DataSourceType[];
  integrations: DataSourceIntegration[];
  canUseManagedDataSources: boolean;
  gaTrackingId: string;
  nangoConfig: {
    publicKey: string;
    slackConnectorId: string;
    notionConnectorId: string;
    googleDriveConnectorId: string;
  };
  githubAppUrl: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  if (!user) {
    return {
      notFound: true,
    };
  }

  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();

  const allDataSources = await getDataSources(auth);
  const dataSources = allDataSources.filter((ds) => !ds.connectorId);
  const managedDataSources = allDataSources.filter((ds) => ds.connectorId);

  const managedConnector: {
    dataSourceName: string;
    provider: ConnectorProvider;
    connector: ConnectorType | null;
    fetchConnectorError: boolean;
  }[] = await Promise.all(
    managedDataSources.map(async (mds) => {
      if (!mds.connectorId || !mds.connectorProvider) {
        throw new Error(
          // Should never happen, but we need to make eslint happy
          "Unexpected empty `connectorId or `connectorProvider` for managed data sources"
        );
      }
      try {
        const statusRes = await ConnectorsAPI.getConnector(mds.connectorId);
        if (statusRes.isErr()) {
          return {
            dataSourceName: mds.name,
            provider: mds.connectorProvider,
            connector: null,
            fetchConnectorError: true,
          };
        }
        return {
          dataSourceName: mds.name,
          provider: mds.connectorProvider,
          connector: statusRes.value,
          fetchConnectorError: false,
        };
      } catch (e) {
        // Probably means `connectors` is down, we log but don't fail to avoid a 500 when just
        // displaying the datasources (eventual actions will fail but a 500 just at display is not
        // desirable). When that happens the managed data sources are shown as failed.
        logger.error(
          {
            error: e,
          },
          "Failed to get connector"
        );
        return {
          dataSourceName: mds.name,
          provider: mds.connectorProvider,
          connector: null,
          fetchConnectorError: true,
        };
      }
    })
  );

  const integrations: DataSourceIntegration[] = managedConnector.map((mc) => {
    const integration = CONNECTOR_CONFIGURATIONS[mc.provider];
    return {
      name: integration.name,
      connectorProvider: integration.connectorProvider,
      isBuilt: integration.isBuilt,
      logoPath: integration.logoPath,
      description: integration.description,
      dataSourceName: mc.dataSourceName,
      connector: mc.connector,
      fetchConnectorError: mc.fetchConnectorError,
      synchronizedAgo: mc.connector?.lastSyncSuccessfulTime
        ? timeAgoFrom(mc.connector.lastSyncSuccessfulTime)
        : null,
      setupWithSuffix: null,
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
        isBuilt: integration.isBuilt,
        logoPath: integration.logoPath,
        description: integration.description,
        dataSourceName: null,
        connector: null,
        fetchConnectorError: false,
        synchronizedAgo: null,
        setupWithSuffix:
          setupWithSuffix?.connector === key ? setupWithSuffix.suffix : null,
      });
    }
  }

  return {
    props: {
      user,
      owner,
      readOnly,
      isAdmin,
      dataSources,
      integrations,
      canUseManagedDataSources: owner.plan.limits.dataSources.managed,
      gaTrackingId: GA_TRACKING_ID,
      nangoConfig: {
        publicKey: NANGO_PUBLIC_KEY,
        slackConnectorId: NANGO_SLACK_CONNECTOR_ID,
        notionConnectorId: NANGO_NOTION_CONNECTOR_ID,
        googleDriveConnectorId: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
      },
      githubAppUrl: GITHUB_APP_URL,
    },
  };
};

export default function DataSourcesView({
  user,
  owner,
  readOnly,
  isAdmin,
  dataSources,
  integrations,
  canUseManagedDataSources,
  gaTrackingId,
  nangoConfig,
  githubAppUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [localIntegrations, setLocalIntegrations] = useState(integrations);

  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Record<ConnectorProvider, boolean | undefined>
  >({} as Record<ConnectorProvider, boolean | undefined>);

  const handleEnableManagedDataSource = async (
    provider: ConnectorProvider,
    suffix: string | null
  ) => {
    try {
      let connectionId: string;
      if (connectorIsUsingNango(provider)) {
        // nango-based connectors
        const nangoConnectorId = {
          slack: nangoConfig.slackConnectorId,
          notion: nangoConfig.notionConnectorId,
          google_drive: nangoConfig.googleDriveConnectorId,
        }[provider];
        const nango = new Nango({ publicKey: nangoConfig.publicKey });
        const newConnectionId = buildConnectionId(owner.sId, provider);
        const {
          connectionId: nangoConnectionId,
        }: { providerConfigKey: string; connectionId: string } =
          await nango.auth(nangoConnectorId, newConnectionId);
        connectionId = nangoConnectionId;
      } else if (provider === "github") {
        const installationId = await githubAuth(githubAppUrl);
        connectionId = installationId;
      } else {
        throw new Error(`Unknown provider ${provider}`);
      }

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
            connectionId,
          }),
        }
      );

      if (res.ok) {
        const createdManagedDataSource: {
          dataSource: DataSourceType;
          connector: ConnectorType;
        } = await res.json();
        setLocalIntegrations((prev) =>
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
        if (provider === "google_drive") {
          void router.push(
            `/w/${owner.sId}/builder/data-sources/${createdManagedDataSource.dataSource.name}?edit_permissions=true`
          );
        }
      } else {
        const responseText = await res.text();
        window.alert(
          `Failed to enable ${provider} Data Source: ${responseText}`
        );
      }
    } catch (e) {
      window.alert(`Failed to enable ${provider} data source`);
      console.error(`Failed to enable ${provider} data source`, e);
    } finally {
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: false }));
    }
  };

  useEffect(() => {
    setLocalIntegrations(localIntegrations);
  }, [localIntegrations]);

  const router = useRouter();

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "data_sources" })}
    >
      <PageHeader
        title="Data Sources"
        icon={CloudArrowDownIcon}
        description="Control the data Dust has access to and how it's used."
      />

      <div>
        <SectionHeader
          title="Managed Data Sources"
          description="Give Dust real-time data updates by linking your company's online knowledge bases."
        />

        <div>
          <ul role="list" className="mt-4 divide-y divide-structure-200">
            {localIntegrations.map((ds) => {
              return (
                <li
                  key={
                    ds.dataSourceName ||
                    `managed-to-connect-${ds.connectorProvider}`
                  }
                  className="px-2 py-4"
                >
                  <div className="flex items-start">
                    <div className="min-w-5 flex">
                      {ds.logoPath ? (
                        <div className="mr-2 flex h-5 w-5 flex-initial sm:mr-4">
                          <img src={ds.logoPath}></img>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col">
                      <div className="flex flex-col sm:flex-row sm:items-center">
                        {ds.connector ? (
                          <Link
                            href={`/w/${owner.sId}/builder/data-sources/${ds.dataSourceName}`}
                            className="flex"
                          >
                            <span
                              className={classNames(
                                "text-sm font-bold text-element-900"
                              )}
                            >
                              {ds.name}
                            </span>
                          </Link>
                        ) : (
                          <span
                            className={classNames(
                              "text-sm font-bold text-element-900"
                            )}
                          >
                            {ds.name}
                          </span>
                        )}

                        {ds && ds.connector && (
                          <div className="text-sm text-element-700 sm:ml-2">
                            {ds.fetchConnectorError ? (
                              <span className="inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">
                                errored
                              </span>
                            ) : (
                              <>
                                {!ds.connector.lastSyncSuccessfulTime ? (
                                  <span>
                                    Synchronizing
                                    {ds.connector?.firstSyncProgress
                                      ? ` (${ds.connector?.firstSyncProgress})`
                                      : null}
                                  </span>
                                ) : (
                                  <>
                                    <span className="">
                                      Last Sync ~ {ds.synchronizedAgo} ago
                                    </span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mr-2 mt-2 text-sm text-element-700">
                        {ds.description}
                      </div>
                    </div>
                    <div className="flex flex-1"></div>
                    <div>
                      {(() => {
                        const disabled =
                          !ds.isBuilt ||
                          isLoadingByProvider[
                            ds.connectorProvider as ConnectorProvider
                          ] ||
                          !isAdmin;
                        const onclick = canUseManagedDataSources
                          ? async () => {
                              await handleEnableManagedDataSource(
                                ds.connectorProvider as ConnectorProvider,
                                ds.setupWithSuffix
                              );
                            }
                          : () => {
                              window.alert(
                                "Managed Data Sources are only available on our paid plans. Contact us at team@dust.tt to get access."
                              );
                            };
                        const label = !ds.isBuilt
                          ? "Coming soon"
                          : !isLoadingByProvider[
                              ds.connectorProvider as ConnectorProvider
                            ] && !ds.fetchConnectorError
                          ? "Connect"
                          : "Connecting...";
                        if (!ds || !ds.connector) {
                          return (
                            <>
                              {ds.connectorProvider !== "google_drive" && (
                                <Button
                                  variant="primary"
                                  icon={CloudArrowLeftRightIcon}
                                  disabled={disabled}
                                  onClick={onclick}
                                  label={label}
                                />
                              )}
                              {ds.connectorProvider === "google_drive" && (
                                <DropdownMenu>
                                  <DropdownMenu.Button>
                                    <Button
                                      variant="primary"
                                      label={label}
                                      disabled={disabled}
                                      icon={CloudArrowLeftRightIcon}
                                    />
                                  </DropdownMenu.Button>
                                  <DropdownMenu.Items
                                    origin="topRight"
                                    width={350}
                                  >
                                    <div className="flex flex-col gap-y-4 p-4">
                                      <div className="flex flex-col gap-y-2">
                                        <div className="grow text-sm font-medium text-element-800">
                                          Disclosure
                                        </div>
                                        <div className="text-sm font-normal text-element-700">
                                          Dust's use of information received
                                          from the Google APIs will adhere to{" "}
                                          <Link
                                            className="s-text-action-500"
                                            href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                                          >
                                            Google API Services User Data Policy
                                          </Link>
                                          , including the Limited Use
                                          requirements.
                                        </div>
                                      </div>

                                      <div className="flex flex-col gap-y-2">
                                        <div className="grow text-sm font-medium text-element-800">
                                          Notice on data processing
                                        </div>
                                        <div className="text-sm font-normal text-element-700">
                                          By connecting Google Drive, you
                                          acknowledge and agree that within your
                                          Google Drive, the data contained in
                                          the files and folders that you choose
                                          to synchronize with Dust will be
                                          transmitted to third-party entities,
                                          including but not limited to
                                          Artificial Intelligence (AI) model
                                          providers, for the purpose of
                                          processing and analysis. This process
                                          is an integral part of the
                                          functionality of our service and is
                                          subject to the terms outlined in our
                                          Privacy Policy and Terms of Service.
                                        </div>
                                      </div>
                                      <div className="flex justify-center">
                                        <DropdownMenu.Button>
                                          <Button
                                            variant="secondary"
                                            icon={CloudArrowLeftRightIcon}
                                            disabled={disabled}
                                            onClick={onclick}
                                            label="Acknowledge and Connect"
                                          />
                                        </DropdownMenu.Button>
                                      </div>
                                    </div>
                                  </DropdownMenu.Items>
                                </DropdownMenu>
                              )}
                            </>
                          );
                        } else {
                          return (
                            <Button
                              variant="secondary"
                              icon={Cog6ToothIcon}
                              disabled={
                                !ds.isBuilt ||
                                isLoadingByProvider[
                                  ds.connectorProvider as ConnectorProvider
                                ] ||
                                // Can't manage or view if not (admin or not readonly (ie builder)).
                                !(isAdmin || !readOnly)
                              }
                              onClick={() => {
                                void router.push(
                                  `/w/${owner.sId}/builder/data-sources/${ds.dataSourceName}`
                                );
                              }}
                              label={isAdmin ? "Manage" : "View"}
                            />
                          );
                        }
                      })()}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-col">
        <SectionHeader
          title="Static Data Sources"
          description="Lets you expose static data to Dust."
          action={
            !readOnly
              ? {
                  label: "Add a new Data Source",
                  variant: "secondary",
                  icon: PlusIcon,
                  onClick: () => {
                    // Enforce plan limits: DataSources count.
                    if (
                      owner.plan.limits.dataSources.count != -1 &&
                      dataSources.length >= owner.plan.limits.dataSources.count
                    ) {
                      window.alert(
                        "You are limited to 1 DataSource on our free plan. Contact team@dust.tt if you want to increase this limit."
                      );
                      return;
                    } else {
                      void router.push(
                        `/w/${owner.sId}/builder/data-sources/new`
                      );
                    }
                  },
                }
              : undefined
          }
        />

        <div className="my-4">
          <ul role="list" className="mt-4 divide-y divide-structure-200">
            {dataSources.map((ds) => (
              <li key={ds.name} className="px-2">
                <div className="py-4">
                  <div className="flex items-start">
                    <div className="mr-2 flex h-5 w-5 flex-initial sm:mr-4">
                      <CloudArrowDownIcon className="h-5 w-5 text-element-600" />
                    </div>
                    <div className="fexl flex-col">
                      <Link
                        href={`/w/${owner.sId}/builder/data-sources/${ds.name}`}
                        className="flex"
                      >
                        <p className="truncate text-sm font-bold text-element-900">
                          {ds.name}
                        </p>
                      </Link>
                      <div className="mt-2 text-sm text-element-700">
                        {ds.description}
                      </div>
                    </div>

                    <div className="flex flex-1"></div>

                    <div>
                      <Button
                        variant="secondary"
                        icon={Cog6ToothIcon}
                        onClick={() => {
                          void router.push(
                            `/w/${owner.sId}/builder/data-sources/${ds.name}`
                          );
                        }}
                        label="Manage"
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
