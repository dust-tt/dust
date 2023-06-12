import { ChevronRightIcon } from "@heroicons/react/20/solid";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import { mutate } from "swr";

import ModelPicker from "@app/components/app/ModelPicker";
import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/data_source/MainTab";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ConnectorsAPI, ConnectorType } from "@app/lib/connectors_api";
import { getProviderLogoPathForDataSource } from "@app/lib/data_sources";
import { APIError } from "@app/lib/error";
import { githubAuth } from "@app/lib/github_auth";
import { useDocuments } from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import { DataSourceType, DataSourceVisibility } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const {
  GA_TRACKING_ID = "",
  NANGO_SLACK_CONNECTOR_ID = "",
  NANGO_NOTION_CONNECTOR_ID = "",
  NANGO_PUBLIC_KEY = "",
  GITHUB_APP_URL = "",
} = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  dataSource: DataSourceType;
  connector?: ConnectorType | null;
  fetchConnectorError?: boolean;
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

  if (!auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const dataSource = await getDataSource(auth, context.params?.name as string);
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  let connector: ConnectorType | null = null;
  let fetchConnectorError = false;
  if (dataSource.connectorId) {
    const connectorRes = await ConnectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
    } else {
      fetchConnectorError = true;
    }
  }

  return {
    props: {
      user,
      owner,
      dataSource,
      connector,
      fetchConnectorError,
      gaTrackingId: GA_TRACKING_ID,
      nangoConfig: {
        publicKey: NANGO_PUBLIC_KEY,
        slackConnectorId: NANGO_SLACK_CONNECTOR_ID,
        notionConnectorId: NANGO_NOTION_CONNECTOR_ID,
      },
    },
  };
};

export default function DataSourceSettings({
  user,
  owner,
  dataSource,
  connector,
  fetchConnectorError,
  gaTrackingId,
  nangoConfig,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const managed = !!dataSource.connectorId;
  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      dataSource={dataSource}
    >
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial" />
        <MainTab currentTab="Settings" owner={owner} dataSource={dataSource} />
        {!managed ? (
          <StandardDataSourceSettings dataSource={dataSource} owner={owner} />
        ) : (
          <ManagedDataSourceSettings
            dataSource={dataSource}
            owner={owner}
            connector={connector || null}
            fetchConnectorError={fetchConnectorError || false}
            nangoConfig={nangoConfig}
          />
        )}
      </div>
    </AppLayout>
  );
}

function StandardDataSourceSettings({
  owner,
  dataSource,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
}) {
  const dataSourceConfig = JSON.parse(dataSource.config || "{}");

  const [dataSourceDescription, setDataSourceDescription] = useState(
    dataSource.description || ""
  );
  const [dataSourceVisibility, setDataSourceVisibility] = useState(
    dataSource.visibility
  );

  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const router = useRouter();

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this DataSource?")) {
      setIsDeleting(true);
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.name}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        await mutate(`/api/w/${owner.sId}/data_sources`);
        await router.push(`/w/${owner.sId}/ds`);
      } else {
        setIsDeleting(false);
        const err = (await res.json()) as { error: APIError };
        window.alert(
          `Failed to delete the Data Source (contact team@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
        );
      }
      return true;
    } else {
      return false;
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: dataSourceDescription,
          visibility: dataSourceVisibility,
        }),
      }
    );
    if (res.ok) {
      await router.push(`/w/${owner.sId}/ds/${dataSource.name}`);
    } else {
      setIsUpdating(false);
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to update the Data Source (contact team@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
  };

  return (
    <div className="">
      <div className="mx-auto mt-8 max-w-4xl px-4">
        <div className="mt-8 space-y-8 divide-y divide-gray-200">
          <div className="space-y-8 divide-y divide-gray-200">
            <div>
              <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label
                    htmlFor="dataSourceName"
                    className="block text-sm font-medium text-gray-700"
                  >
                    DataSource Name
                  </label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 pl-3 pr-1 text-sm text-gray-500">
                      {owner.name}
                      <ChevronRightIcon
                        className="h-5 w-5 flex-shrink-0 pt-0.5 text-gray-400"
                        aria-hidden="true"
                      />
                    </span>
                    <input
                      type="text"
                      name="name"
                      id="dataSourceName"
                      className={classNames(
                        "block w-full min-w-0 flex-1 rounded-none rounded-r-md border-gray-300 text-sm",
                        "focus:border-gray-300 focus:ring-0"
                      )}
                      value={dataSource.name}
                      readOnly={true}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Think GitHub repository names, short and memorable.
                  </p>
                </div>

                <div className="sm:col-span-6">
                  <div className="flex justify-between">
                    <label
                      htmlFor="dataSourceDescription"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Description
                    </label>
                    <div className="text-sm font-normal text-gray-400">
                      optional
                    </div>
                  </div>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                      type="text"
                      name="description"
                      id="dataSourceDescription"
                      className={classNames(
                        "block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm",
                        "focus:border-violet-500 focus:ring-violet-500"
                      )}
                      value={dataSourceDescription}
                      onChange={(e) => setDataSourceDescription(e.target.value)}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    A good description will help others discover and understand
                    the purpose of your Data Source.
                  </p>
                </div>

                <div className="sm:col-span-6">
                  <fieldset className="mt-2">
                    <legend className="contents text-sm font-medium text-gray-700">
                      Visibility
                    </legend>
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center">
                        <input
                          id="dataSourceVisibilityPublic"
                          name="visibility"
                          type="radio"
                          className="h-4 w-4 cursor-pointer border-gray-300 text-violet-600 focus:ring-violet-500"
                          value="public"
                          checked={dataSourceVisibility == "public"}
                          onChange={(e) => {
                            if (e.target.value != dataSourceVisibility) {
                              setDataSourceVisibility(
                                e.target.value as DataSourceVisibility
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor="dataSourceVisibilityPublic"
                          className="ml-3 block text-sm font-medium text-gray-700"
                        >
                          Public
                          <p className="mt-0 text-sm font-normal text-gray-500">
                            Anyone on the Internet can discover and access your
                            DataSource. Only you can edit.
                          </p>
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          id="dataSourceVisibilityPrivate"
                          name="visibility"
                          type="radio"
                          value="private"
                          className="h-4 w-4 cursor-pointer border-gray-300 text-violet-600 focus:ring-violet-500"
                          checked={dataSourceVisibility == "private"}
                          onChange={(e) => {
                            if (e.target.value != dataSourceVisibility) {
                              setDataSourceVisibility(
                                e.target.value as DataSourceVisibility
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor="dataSourceVisibilityPrivate"
                          className="ml-3 block text-sm font-medium text-gray-700"
                        >
                          Private
                          <p className="mt-0 text-sm font-normal text-gray-500">
                            Only you can see and edit the DataSource.
                          </p>
                        </label>
                      </div>
                    </div>
                  </fieldset>
                </div>
              </div>
            </div>

            <div>
              <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
                <div className="sm:col-span-6">
                  <label
                    htmlFor="embedder"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Embedder
                  </label>
                  <div className="mt-1 flex">
                    <ModelPicker
                      owner={owner}
                      readOnly={true}
                      model={{
                        provider_id: dataSourceConfig.provider_id || "",
                        model_id: dataSourceConfig.model_id || "",
                      }}
                      onModelUpdate={() => {
                        // no-op
                      }}
                      chatOnly={false}
                      embedOnly={true}
                    />
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <div className="flex justify-between">
                    <label
                      htmlFor="dataSourceDescription"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Max Chunk Size
                    </label>
                  </div>
                  <div className="mt-1 flex w-32 rounded-md shadow-sm">
                    <input
                      type="number"
                      name="max_chunk_size"
                      id="dataSourceMaxChunkSize"
                      className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-gray-300 focus:ring-0"
                      value={dataSourceConfig.max_chunk_size}
                      readOnly={true}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex pt-6">
            <div className="flex">
              <Button
                onClick={handleUpdate}
                disabled={isDeleting || isUpdating}
              >
                {isUpdating ? "Updating..." : "Update"}
              </Button>
            </div>
            <div className="flex-1"></div>
            <div className="ml-2 flex">
              <Button
                onClick={handleDelete}
                disabled={isDeleting || isUpdating}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManagedDataSourceStatus({
  fetchConnectorError,
  connector,
}: {
  fetchConnectorError: boolean;
  connector: ConnectorType | null;
}) {
  if (fetchConnectorError) {
    return (
      <p className="inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">
        errored
      </p>
    );
  }

  if (!connector?.lastSyncSuccessfulTime) {
    return (
      <p className="leading-2 inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">
        Synchronizing
        {connector?.firstSyncProgress
          ? ` (${connector?.firstSyncProgress})`
          : null}
      </p>
    );
  } else {
    return (
      <div className="flex flex-col">
        <div className="flex flex-row ">
          <p className="leading-2 inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">
            Synchronized
          </p>
        </div>
        <p className="flex-1 rounded-full px-2 text-xs italic text-gray-400">
          {timeAgoFrom(connector.lastSyncSuccessfulTime)} ago
        </p>
      </div>
    );
  }
}

function ManagedDataSourceSettings({
  owner,
  dataSource,
  connector,
  fetchConnectorError,
  nangoConfig,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  connector: ConnectorType | null;
  fetchConnectorError: boolean;
  nangoConfig: {
    publicKey: string;
    slackConnectorId: string;
    notionConnectorId: string;
  };
}) {
  const logo = getProviderLogoPathForDataSource(dataSource);
  if (!logo) {
    throw new Error(`No logo for data source ${dataSource.name}`);
  }
  const dataSourceName = dataSource.connectorProvider
    ? dataSource.connectorProvider.charAt(0).toUpperCase() +
      dataSource.connectorProvider.slice(1)
    : "";

  const { total } = useDocuments(owner, dataSource, 0, 0);

  const handleUpdatePermissions = async () => {
    if (!connector) {
      return;
    }
    const provider = connector.type;

    if (provider === "notion" || provider === "slack") {
      const nangoConnectorId =
        provider == "slack"
          ? nangoConfig.slackConnectorId
          : nangoConfig.notionConnectorId;

      const nango = new Nango({ publicKey: nangoConfig.publicKey });

      await nango.auth(nangoConnectorId, `${provider}-${owner.sId}`);
    } else if (provider === "github") {
      await githubAuth(GITHUB_APP_URL);
    }
  };

  return (
    <div className="">
      <div className="mx-auto mt-8 max-w-4xl px-4">
        <div className="-200 mt-8 space-y-8">
          <div className="-200">
            <div>
              <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <div className="flex flex-row items-center">
                    <div className="mr-1 flex h-4 w-4 ">
                      <img src={logo}></img>
                    </div>
                    <label
                      htmlFor="dataSourceName"
                      className="block text-sm font-medium text-gray-700"
                    >
                      {dataSourceName} (managed - {total} documents)
                    </label>
                  </div>
                </div>

                <div className="flex flex-row justify-between sm:col-span-6">
                  <ManagedDataSourceStatus
                    connector={connector}
                    fetchConnectorError={fetchConnectorError}
                  />

                  <div className="flex flex-col">
                    <Button onClick={handleUpdatePermissions}>
                      Update permissions
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
