import { PlusIcon } from "@heroicons/react/24/outline";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import MainTab from "@app/components/admin/MainTab";
import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import GoogleDriveFoldersPickerModal from "@app/components/GoogleDriveFoldersPickerModal";
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

type UpcomingConnectorProvider = "google_drive" | "github";

type DataSourceIntegration = {
  name: string;
  connector?: ConnectorType | null;
  fetchConnectorError: boolean | null;
  isBuilt: boolean;
  connectorProvider: ConnectorProvider | UpcomingConnectorProvider;
  logoPath?: string;
  synchronizedAgo?: string | null;
};

const DATA_SOURCE_INTEGRATIONS: DataSourceIntegration[] = [
  {
    name: "Notion",
    connectorProvider: "notion",
    isBuilt: true,
    logoPath: "/static/notion_32x32.png",
    fetchConnectorError: null,
  },
  {
    name: "Slack",
    connectorProvider: "slack",
    isBuilt: true,
    logoPath: "/static/slack_32x32.png",
    fetchConnectorError: null,
  },
  {
    name: "GitHub",
    connectorProvider: "github",
    isBuilt: true,
    logoPath: "/static/github_black_32x32.png",
    fetchConnectorError: null,
  },
  {
    name: "Google Drive™",
    connectorProvider: "google_drive",
    isBuilt: true,
    logoPath: "/static/google_drive_32x32.png",
    fetchConnectorError: null,
  },
];

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
    value: `/w/${context.query.wId}/ds`,
  });

  const readOnly = !auth.isBuilder();
  const isAdmin = auth.isAdmin();

  const allDataSources = await getDataSources(auth);
  const dataSources = allDataSources.filter((ds) => !ds.connectorId);
  const managedDataSources = allDataSources.filter((ds) => ds.connectorId);
  const provider2Connector = await Promise.all(
    managedDataSources.map(async (mds) => {
      if (!mds.connectorId) {
        throw new Error(
          // Should never happen, but we need to make eslint happy
          "Unexpected empty connectorId for managed data sources"
        );
      }
      try {
        const statusRes = await ConnectorsAPI.getConnector(mds.connectorId);
        if (statusRes.isErr()) {
          return {
            provider: mds.connectorProvider,
            connector: undefined,
            fetchConnectorError: true,
          };
        }
        return {
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
          provider: mds.connectorProvider,
          connector: undefined,
          fetchConnectorError: true,
        };
      }
    })
  );

  return {
    props: {
      user,
      owner,
      readOnly,
      isAdmin,
      dataSources,
      integrations: DATA_SOURCE_INTEGRATIONS.map(
        (managedDs): DataSourceIntegration => {
          const p2c = provider2Connector.find(
            (p) => p.provider == managedDs.connectorProvider
          );
          return {
            ...managedDs,
            connector: p2c?.connector || null,
            fetchConnectorError:
              p2c?.fetchConnectorError === undefined
                ? null
                : p2c.fetchConnectorError,
            synchronizedAgo: p2c?.connector?.lastSyncSuccessfulTime
              ? timeAgoFrom(p2c.connector.lastSyncSuccessfulTime)
              : null,
          };
        }
      ),
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

  const handleEnableManagedDataSource = async (provider: ConnectorProvider) => {
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
        }: { providerConfigKey: string; connectionId: string } =
          await nango.auth(nangoConnectorId, `${provider}-${owner.sId}`);
        connectionId = nangoConnectionId;
      } else if (provider === "github") {
        const installationId = await githubAuth(githubAppUrl);
        connectionId = installationId;
      } else {
        throw new Error(`Unknown provider ${provider}`);
      }

      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: true }));

      const res = await fetch(`/api/w/${owner.sId}/data_sources/managed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          connectionId,
        }),
      });

      if (res.ok) {
        const createdManagedDataSource: {
          dataSource: DataSourceType;
          connector: ConnectorType;
        } = await res.json();
        setLocalIntegrations((prev) =>
          prev.map((ds) => {
            return ds.connectorProvider == provider
              ? { ...ds, connector: createdManagedDataSource.connector }
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
      window.alert(`Failed to enable ${provider} Data Source: ${e}`);
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
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          {googleDrive && googleDrive.connector && (
            <GoogleDriveFoldersPickerModal
              owner={owner}
              connectorId={googleDrive.connector.id}
              isOpen={googleDrivePickerOpen}
              setOpen={setGoogleDrivePickerOpen}
            />
          )}

          <MainTab currentTab="Data Sources" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-4xl divide-y divide-gray-200 px-6">
            <div className="mt-8 flex flex-col justify-between md:flex-row md:items-center">
              <div className="">
                <h1 className="text-base font-medium text-gray-900">
                  Data Sources
                </h1>

                <p className="text-sm text-gray-500">
                  Data Sources let you perform semantic searches on your data.
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
                        dataSources.length >=
                          owner.plan.limits.dataSources.count
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
                        Welcome to Dust Data Sources 🔎 This user has not
                        created any data source yet 🙃
                      </p>
                      <p className="mt-2">
                        Sign-in to create your own data sources.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Welcome to Dust Data Sources 🔎</p>
                      <p className="mt-2">
                        Data sources let you upload documents to perform
                        semantic searches on them (
                        <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                          data_source
                        </span>{" "}
                        block).
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
      </div>
      <div className="mx-auto max-w-4xl space-y-4 divide-y divide-gray-200 px-6">
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
          <ul role="list" className="mt-4">
            {localIntegrations.map((ds) => {
              return (
                <li
                  key={`managed-${ds.connectorProvider}`}
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
                          href={`/w/${
                            owner.sId
                          }/ds/${`managed-${ds.connectorProvider}`}`}
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
                                        ds.connectorProvider as ConnectorProvider
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
