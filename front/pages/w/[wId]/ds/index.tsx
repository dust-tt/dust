import { PlusIcon } from "@heroicons/react/20/solid";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useState } from "react";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/profile/MainTab";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import {
  ConnectorProvider,
  ConnectorsAPI,
  ConnectorSyncStatus,
} from "@app/lib/connectors_api";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const {
  GA_TRACKING_ID = "",
  NANGO_SLACK_CONNECTOR_ID,
  NANGO_NOTION_CONNECTOR_ID,
  NANGO_PUBLIC_KEY,
} = process.env;

type UpcomingConnectorProvider = "google_drive" | "github";

type ManagedDataSource = {
  name: string;
  status?: ConnectorSyncStatus | null;
  enabled?: boolean | null;
  isBuilt: boolean;
  connectorProvider: ConnectorProvider | UpcomingConnectorProvider;
};

const MANAGED_DATA_SOURCES: ManagedDataSource[] = [
  {
    name: "Notion",
    connectorProvider: "notion",
    isBuilt: true,
  },
  {
    name: "Slack",
    connectorProvider: "slack",
    isBuilt: false,
  },
  {
    name: "Google Drive",
    connectorProvider: "google_drive",
    isBuilt: false,
  },
  {
    name: "Github",
    connectorProvider: "github",
    isBuilt: false,
  },
];

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  dataSources: DataSourceType[];
  managedDataSources: ManagedDataSource[];
  canUseManagedDataSources: boolean;
  gaTrackingId: string;
  nangoConfig: {
    publicKey: string;
    slackConnectorId: string;
    notionConnectorId: string;
  };
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
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

  let allDataSources = await getDataSources(auth);
  const dataSources = allDataSources.filter((ds) => !ds.connector);
  const managedDataSources = allDataSources.filter((ds) => ds.connector);

  const connectorStatuses = (
    await Promise.all(
      managedDataSources.map(({ connector }) =>
        ConnectorsAPI.getSyncStatus(connector!.id)
      )
    )
  ).map(
    (s): ConnectorSyncStatus => (s.isErr() ? "failed" : s.value.lastSyncStatus)
  );

  const connectorStatusByProvider: Record<
    ConnectorProvider,
    ConnectorSyncStatus
  > = managedDataSources.reduce(
    (acc, ds, i) =>
      Object.assign(acc, { [ds.connector!.provider]: connectorStatuses[i] }),
    {} as Record<ConnectorProvider, ConnectorSyncStatus>
  );

  return {
    props: {
      user,
      owner,
      readOnly,
      dataSources,
      managedDataSources: MANAGED_DATA_SOURCES.map((ds) => ({
        ...ds,
        enabled:
          !!connectorStatusByProvider[
            ds.connectorProvider as ConnectorProvider
          ],
        status:
          connectorStatusByProvider[
            ds.connectorProvider as ConnectorProvider
          ] || null,
      })),
      canUseManagedDataSources: owner.plan.limits.dataSources.managed,
      gaTrackingId: GA_TRACKING_ID,
      nangoConfig: {
        publicKey: NANGO_PUBLIC_KEY!,
        slackConnectorId: NANGO_SLACK_CONNECTOR_ID!,
        notionConnectorId: NANGO_NOTION_CONNECTOR_ID!,
      },
    },
  };
};

export default function DataSourcesView({
  user,
  owner,
  readOnly,
  dataSources,
  managedDataSources,
  canUseManagedDataSources,
  gaTrackingId,
  nangoConfig,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [managedDataSourcesLocal, setManagedDataSourcesLocal] =
    useState(managedDataSources);

  const [isLoadingByProvider, setIsLoadingByProvider] = useState<
    Record<ConnectorProvider, boolean | undefined>
  >({} as Record<ConnectorProvider, boolean | undefined>);

  const handleEnableManagedDataSource = async (provider: ConnectorProvider) => {
    const nangoConnectorId =
      provider == "slack"
        ? nangoConfig.slackConnectorId
        : nangoConfig.notionConnectorId;
    const nango = new Nango({ publicKey: nangoConfig.publicKey });

    try {
      const {
        connectionId: nangoConnectionId,
      }: { providerConfigKey: string; connectionId: string } = await nango.auth(
        nangoConnectorId!,
        `${provider}-${owner.sId}`
      );

      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: true }));

      const res = await fetch(`/api/w/${owner.sId}/data_sources/managed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          nangoConnectionId,
        }),
      });
      if (res.ok) {
        setManagedDataSourcesLocal((prev) =>
          prev.map((ds) =>
            ds.connectorProvider == provider
              ? { ...ds, enabled: true, status: "succeeded" }
              : ds
          )
        );
      } else {
        logger.error(
          {
            status: res.status,
            body: await res.text(),
            provider,
          },
          `Failed to enable managed data source`
        );
        window.alert(`Failed to enable ${provider}  data source`);
      }
    } catch (e) {
      logger.error(e, "Failed to enable managed data source");
      window.alert(`Failed to enable ${provider}  data source`);
    } finally {
      setIsLoadingByProvider((prev) => ({ ...prev, [provider]: false }));
    }
  };

  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="DataSources" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
            <div>
              {readOnly ? null : (
                <div className="sm:flex sm:items-center">
                  <div className="sm:flex-auto"></div>
                  <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                    <Link
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
                        New DataSource
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              <div className="mt-8 overflow-hidden">
                <ul role="list" className="">
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
                          <div className="mt-2 flex items-center text-sm text-gray-300 sm:mt-0">
                            <p></p>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                  {dataSources.length == 0 ? (
                    <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
                      {readOnly ? (
                        <>
                          <p>
                            Welcome to Dust DataSources 🔎 This user has not
                            created any data source yet 🙃
                          </p>
                          <p className="mt-2">
                            Sign-in to create your own data sources.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>Welcome to Dust DataSources 🔎</p>
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
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto space-y-4 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
        <div className="sm:flex sm:items-center">
          <div className="mt-16 sm:flex-auto">
            <h1 className="text-base font-medium text-gray-900">
              Managed DataSources
            </h1>

            <p className="text-sm text-gray-500">
              Fully managed and kept in sync in real-time with the products you
              use.
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden">
          <ul role="list" className="">
            {managedDataSourcesLocal.map((ds) => {
              return (
                <li
                  key={`managed-${ds.connectorProvider}`}
                  className="px-2 py-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {ds.enabled ? (
                        <Link
                          href={`/w/${
                            owner.sId
                          }/ds/${`managed-${ds.connectorProvider}`}`}
                          className="block"
                        >
                          <p
                            className={classNames(
                              "truncate text-base font-bold",
                              ds.enabled ? "text-violet-600" : "text-slate-400"
                            )}
                          >
                            {ds.name}
                          </p>
                        </Link>
                      ) : (
                        <p
                          className={classNames(
                            "truncate text-base font-bold",
                            ds.enabled ? "text-violet-600" : "text-slate-400"
                          )}
                        >
                          {ds.name}
                        </p>
                      )}
                    </div>
                    <div>
                      {!ds.enabled ? (
                        <Button
                          disabled={
                            !ds.isBuilt ||
                            isLoadingByProvider[
                              ds.connectorProvider as ConnectorProvider
                            ]
                          }
                          onClick={
                            canUseManagedDataSources
                              ? () => {
                                  handleEnableManagedDataSource(
                                    ds.connectorProvider as ConnectorProvider
                                  );
                                }
                              : () => {
                                  window.alert(
                                    "Managed DataSources are only available on our paid plans. Contact us at team@dust.tt to get access."
                                  );
                                  logger.info(
                                    {
                                      workspace: owner.sId,
                                      connector_provider: ds.connectorProvider,
                                    },
                                    "request_early_access_managed_data_source"
                                  );
                                }
                          }
                        >
                          {!ds.isBuilt
                            ? "Coming soon"
                            : !isLoadingByProvider[
                                ds.connectorProvider as ConnectorProvider
                              ]
                            ? "Connect"
                            : "Connecting..."}
                        </Button>
                      ) : (
                        <p
                          className={classNames(
                            "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                            ds.status === "succeeded"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          )}
                        >
                          {ds.status === "succeeded" ? "enabled" : "errored"}
                        </p>
                      )}
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
