import { PlusIcon } from "@heroicons/react/24/outline";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@app/components/Button";
import GoogleDriveFoldersPickerModal from "@app/components/GoogleDriveFoldersPickerModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { setUserMetadata } from "@app/lib/api/user";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
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
  logoPath?: string;
  synchronizedAgo?: string | null;
  setupWithSuffix: string | null;
};

const DATA_SOURCE_INTEGRATIONS: {
  [key in ConnectorProvider]: {
    name: string;
    connectorProvider: ConnectorProvider;
    isBuilt: boolean;
    logoPath: string;
  };
} = {
  notion: {
    name: "Notion",
    connectorProvider: "notion",
    isBuilt: true,
    logoPath: "/static/notion_32x32.png",
  },
  slack: {
    name: "Slack",
    connectorProvider: "slack",
    isBuilt: true,
    logoPath: "/static/slack_32x32.png",
  },
  github: {
    name: "GitHub",
    connectorProvider: "github",
    isBuilt: true,
    logoPath: "/static/github_black_32x32.png",
  },
  google_drive: {
    name: "Google Drive™",
    connectorProvider: "google_drive",
    isBuilt: true,
    logoPath: "/static/google_drive_32x32.png",
  },
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

  void setUserMetadata(user, {
    key: "sticky_path",
    value: `/w/${context.query.wId}/u/chat`,
  });

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
    const integration = DATA_SOURCE_INTEGRATIONS[mc.provider];
    return {
      ...integration,
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
    Object.keys(DATA_SOURCE_INTEGRATIONS).includes(
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

  for (const key in DATA_SOURCE_INTEGRATIONS) {
    if (
      !integrations.find(
        (i) => i.connectorProvider === (key as ConnectorProvider)
      ) ||
      setupWithSuffix?.connector === key
    ) {
      integrations.push({
        ...DATA_SOURCE_INTEGRATIONS[key as ConnectorProvider],
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
  const [googleDrivePickerOpen, setGoogleDrivePickerOpen] = useState(false);

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
        const {
          connectionId: nangoConnectionId,
        }: { providerConfigKey: string; connectionId: string } = suffix
          ? await nango.auth(
              nangoConnectorId,
              `${provider}-${owner.sId}-${suffix}`
            )
          : await nango.auth(nangoConnectorId, `${provider}-${owner.sId}`);
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
          setGoogleDrivePickerOpen(true);
        }
      } else {
        const responseText = await res.text();
        window.alert(
          `Failed to enable ${provider} Data Source: ${responseText}`
        );
      }
    } catch (e) {
      window.alert(`Failed to enable ${provider} data source: ${e}`);
    } finally {
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: false }));
    }
  };

  useEffect(() => {
    setLocalIntegrations(localIntegrations);
  }, [localIntegrations]);

  const googleDrive = localIntegrations.find((integration) => {
    return integration.connectorProvider === "google_drive";
  });

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "data_sources" })}
    >
      <div className="flex flex-col">
        <div className="divide-y divide-gray-200">
          <div className="flex flex-col justify-between md:flex-row md:items-center">
            <div className="">
              <h1 className="text-base font-medium text-gray-900">
                Data Sources
              </h1>

              <p className="text-sm text-gray-500">
                Data Sources let you expose your data to Dust.
              </p>
            </div>
            <div className="mr-2 mt-2 whitespace-nowrap md:ml-12">
              {!readOnly && (
                <Link
                  className="ml-auto"
                  href={`/w/${owner.sId}/ds/new`}
                  onClick={(e) => {
                    // Enforce plan limits: DataSources count.
                    if (
                      owner.plan.limits.dataSources.count != -1 &&
                      dataSources.length >= owner.plan.limits.dataSources.count
                    ) {
                      e.preventDefault();
                      window.alert(
                        "You are limited to 1 DataSource on our free plan. Contact team@dust.tt if you want to increase this limit."
                      );
                      return;
                    }
                  }}
                >
                  <Button>
                    <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                    Create Data Source
                  </Button>
                </Link>
              )}
            </div>
          </div>
          <div className="my-4">
            {dataSources.length == 0 ? (
              <div className="mt-12 flex flex-col items-center justify-center pt-4 text-sm text-gray-500">
                {readOnly ? (
                  <>
                    <p>
                      Welcome to Dust Data Sources 🔎 This user has not created
                      any data source yet 🙃
                    </p>
                    <p className="mt-2">
                      Sign-in to create your own data sources.
                    </p>
                  </>
                ) : (
                  <>
                    <p>Welcome to Dust Data Sources 🔎</p>
                    <p className="mt-2">
                      Data sources let you upload documents to expose
                      information to Dust.
                    </p>
                  </>
                )}
              </div>
            ) : null}
            <ul role="list" className="pt-4">
              {dataSources.map((ds) => (
                <li key={ds.name} className="px-2">
                  <div className="py-4">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/w/${owner.sId}/ds/${ds.name}`}
                        className="block"
                      >
                        <p className="truncate text-base font-bold text-violet-600">
                          {ds.name}
                        </p>
                      </Link>
                      <div className="ml-2 flex flex-shrink-0">
                        <p
                          className={classNames(
                            "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                            ds.visibility == "public"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          )}
                        >
                          {ds.visibility}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-700">
                          {ds.description}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-300 sm:mt-0"></div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="space-y-4 divide-y divide-gray-200">
        <div className="sm:flex sm:items-center">
          <div className="mt-8 sm:flex-auto">
            <h1 className="text-base font-medium text-gray-900">
              Managed Data Sources
            </h1>

            <p className="text-sm text-gray-500 ">
              Continuously synchronized with the products you use.
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden">
          {googleDrive && googleDrive.connector && (
            <GoogleDriveFoldersPickerModal
              owner={owner}
              connectorId={googleDrive.connector.id}
              isOpen={googleDrivePickerOpen}
              setOpen={setGoogleDrivePickerOpen}
            />
          )}
          <ul role="list" className="mt-4">
            {localIntegrations.map((ds) => {
              return (
                <li
                  key={
                    ds.dataSourceName ||
                    `managed-to-connect-${ds.connectorProvider}`
                  }
                  className="px-2 py-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {ds.logoPath ? (
                        <div className="mr-1 flex h-4 w-4 flex-initial">
                          <img src={ds.logoPath}></img>
                        </div>
                      ) : null}
                      {ds.connector ? (
                        <Link
                          href={`/w/${owner.sId}/ds/${ds.dataSourceName}`}
                          className="block"
                        >
                          <p
                            className={classNames(
                              "truncate text-base font-bold",
                              ds.connector
                                ? "text-violet-600"
                                : "text-slate-400"
                            )}
                          >
                            {ds.name}
                          </p>
                        </Link>
                      ) : (
                        <p
                          className={classNames(
                            "truncate text-base font-bold",
                            ds.connector ? "text-violet-600" : "text-slate-400"
                          )}
                        >
                          {ds.name}
                        </p>
                      )}
                    </div>
                    <div>
                      {(() => {
                        if (ds.fetchConnectorError) {
                          return (
                            <p className="inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">
                              errored
                            </p>
                          );
                        }

                        if (!ds || !ds.connector) {
                          return (
                            <Button
                              disabled={
                                !ds.isBuilt ||
                                isLoadingByProvider[
                                  ds.connectorProvider as ConnectorProvider
                                ] ||
                                !isAdmin
                              }
                              onClick={
                                canUseManagedDataSources
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
                                    }
                              }
                            >
                              {!ds.isBuilt
                                ? "Coming soon"
                                : !isLoadingByProvider[
                                    ds.connectorProvider as ConnectorProvider
                                  ] && !ds.fetchConnectorError
                                ? "Connect"
                                : "Connecting..."}
                            </Button>
                          );
                        }

                        if (!ds.connector?.lastSyncSuccessfulTime) {
                          return (
                            <div className="flex-col justify-items-end text-right">
                              <p className="leading-2 inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">
                                Synchronizing
                                {ds.connector?.firstSyncProgress
                                  ? ` (${ds.connector?.firstSyncProgress})`
                                  : null}
                              </p>
                            </div>
                          );
                        } else {
                          return (
                            <>
                              <div className="flex-col justify-items-end text-right">
                                <p className="leading-2 inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">
                                  Synchronized
                                </p>
                                <p className="flex-1 rounded-full px-2 text-xs italic text-gray-400">
                                  {ds.synchronizedAgo} ago
                                </p>
                              </div>
                            </>
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
    </AppLayout>
  );
}
