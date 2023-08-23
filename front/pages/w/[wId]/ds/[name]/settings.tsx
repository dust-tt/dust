import { Button } from "@dust-tt/sparkle";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import Nango from "@nangohq/frontend";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { mutate } from "swr";

import ModelPicker from "@app/components/app/ModelPicker";
import ConnectorPermissionsModal from "@app/components/ConnectorPermissionsModal";
import GoogleDriveFoldersPickerModal from "@app/components/GoogleDriveFoldersPickerModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { buildConnectionId } from "@app/lib/connector_connection_id";
import {
  connectorIsUsingNango,
  ConnectorsAPI,
  ConnectorType,
} from "@app/lib/connectors_api";
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
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "",
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
    googleDriveConnectorId: string;
  };
  githubAppUrl: string;
  canUpdatePermissions: boolean;
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

  let canUpdatePermissions = false;
  if (context.query.updatePermissions === "enabled") {
    canUpdatePermissions = true;
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
        googleDriveConnectorId: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
      },
      githubAppUrl: GITHUB_APP_URL,
      canUpdatePermissions,
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
  githubAppUrl,
  canUpdatePermissions,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const managed = !!dataSource.connectorId && !!connector;
  const [isUpdating, setIsUpdating] = useState(false);

  const router = useRouter();

  const handleUpdate = async (
    settings:
      | {
          description: string;
          visibility: DataSourceVisibility;
          userUpsertable: boolean;
          assistantDefaultSelected: boolean;
        }
      | { assistantDefaultSelected: boolean }
  ) => {
    setIsUpdating(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
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
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: "data_sources",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Data Source Settings"
          onClose={() => {
            void router.push(`/w/${owner.sId}/ds/${dataSource.name}`);
          }}
        />
      }
    >
      <div className="flex flex-col">
        {!managed ? (
          <StandardDataSourceSettings
            dataSource={dataSource}
            owner={owner}
            handleUpdate={(settings: {
              description: string;
              visibility: DataSourceVisibility;
              userUpsertable: boolean;
              assistantDefaultSelected: boolean;
            }) => handleUpdate(settings)}
            isUpdating={isUpdating}
          />
        ) : (
          <ManagedDataSourceSettings
            dataSource={dataSource}
            owner={owner}
            connector={connector}
            fetchConnectorError={fetchConnectorError || false}
            nangoConfig={nangoConfig}
            githubAppUrl={githubAppUrl}
            canUpdatePermissions={canUpdatePermissions}
            handleUpdate={(settings: { assistantDefaultSelected: boolean }) =>
              handleUpdate(settings)
            }
            isUpdating={isUpdating}
          />
        )}
      </div>
    </AppLayout>
  );
}

function StandardDataSourceSettings({
  owner,
  dataSource,
  handleUpdate,
  isUpdating,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  handleUpdate: (settings: {
    description: string;
    visibility: DataSourceVisibility;
    userUpsertable: boolean;
    assistantDefaultSelected: boolean;
  }) => Promise<void>;
  isUpdating: boolean;
}) {
  const dataSourceConfig = JSON.parse(dataSource.config || "{}");

  const [dataSourceDescription, setDataSourceDescription] = useState(
    dataSource.description || ""
  );
  const [assistantDefaultSelected, setAssistantDefaultSelected] = useState(
    dataSource.assistantDefaultSelected
  );

  const [isDeleting, setIsDeleting] = useState(false);

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

  return (
    <div className="space-y-8 divide-y divide-gray-200">
      <div className="space-y-8 divide-y divide-gray-200">
        <div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
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
                    "focus:border-action-500 focus:ring-action-500"
                  )}
                  value={dataSourceDescription}
                  onChange={(e) => setDataSourceDescription(e.target.value)}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                A good description will help users discover and understand the
                purpose of your Data Source.
              </p>
            </div>

            <div className="mt-2 sm:col-span-6">
              <div className="flex justify-between">
                <label
                  htmlFor="assistantDefaultSelected"
                  className="block text-sm font-medium text-gray-700"
                >
                  Automatically select this DataSource for Assistant queries
                </label>
              </div>
              <div className="mt-2 flex items-center">
                <input
                  id="assistantDefaultSelected"
                  name="assistantDefaultSected"
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer border-gray-300 text-action-600 focus:ring-action-500"
                  checked={assistantDefaultSelected}
                  onChange={(e) =>
                    setAssistantDefaultSelected(e.target.checked)
                  }
                />
                <p className="ml-3 block text-sm text-sm font-normal text-gray-500">
                  The assistant will use the DataSource by default when
                  answering questions. Users can still choose not to use the
                  DataSource for a given conversation with the assistant by
                  clicking on the DataSource's icon below the chat input.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-12">
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
              <div className="mt-1 flex text-sm font-medium">
                {dataSourceConfig.max_chunk_size}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex pt-6">
        <div className="flex">
          <Button
            type="secondaryWarning"
            onClick={handleDelete}
            disabled={isDeleting || isUpdating}
            label={isDeleting ? "Deleting..." : "Delete"}
          />
        </div>
        <div className="flex-1"></div>
        <div className="ml-2 flex">
          <Button
            type="tertiary"
            onClick={() => {
              void router.push(`/w/${owner.sId}/ds/${dataSource.name}`);
            }}
            disabled={isDeleting || isUpdating}
            label={"Cancel"}
          />
        </div>
        <div className="ml-2 flex">
          <Button
            type="secondary"
            onClick={() => {
              void handleUpdate({
                description: dataSourceDescription,
                visibility: "private",
                userUpsertable: false,
                assistantDefaultSelected,
              });
            }}
            disabled={isDeleting || isUpdating}
            label={isUpdating ? "Updating..." : "Update"}
          />
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
  const [synchronizedTimeAgo, setSynchronizedTimeAgo] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (connector?.lastSyncSuccessfulTime)
      setSynchronizedTimeAgo(timeAgoFrom(connector.lastSyncSuccessfulTime));
  }, []);

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
          {synchronizedTimeAgo && `${synchronizedTimeAgo} ago`}
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
  githubAppUrl,
  canUpdatePermissions,
  handleUpdate,
  isUpdating,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  connector: ConnectorType;
  fetchConnectorError: boolean;
  nangoConfig: {
    publicKey: string;
    slackConnectorId: string;
    notionConnectorId: string;
    googleDriveConnectorId: string;
  };
  githubAppUrl: string;
  canUpdatePermissions: boolean;
  handleUpdate: (settings: {
    assistantDefaultSelected: boolean;
  }) => Promise<void>;
  isUpdating: boolean;
}) {
  const [assistantDefaultSelected, setAssistantDefaultSelected] = useState(
    dataSource.assistantDefaultSelected
  );
  const logo = getProviderLogoPathForDataSource(dataSource);
  if (!logo) {
    throw new Error(`No logo for data source ${dataSource.name}`);
  }
  const [googleDrivePickerOpen, setGoogleDrivePickerOpen] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const dataSourceName = dataSource.connectorProvider
    ? dataSource.connectorProvider.charAt(0).toUpperCase() +
      dataSource.connectorProvider.slice(1)
    : "";

  const { total } = useDocuments(owner, dataSource, 0, 0);

  const handleUpdatePermissions = async () => {
    if (!canUpdatePermissions) {
      window.alert(
        "Please contact us at team@dust.tt if you wish to update the permissions of this managed data source."
      );
      return;
    }

    if (!connector) {
      console.error("No connector");
      return;
    }
    const provider = connector.type;

    if (connectorIsUsingNango(provider)) {
      const nangoConnectorId = {
        slack: nangoConfig.slackConnectorId,
        notion: nangoConfig.notionConnectorId,
        google_drive: nangoConfig.googleDriveConnectorId,
      }[provider];

      const nango = new Nango({ publicKey: nangoConfig.publicKey });

      const newConnectionId = buildConnectionId(owner.sId, provider);
      await nango.auth(nangoConnectorId, newConnectionId);

      const updateRes = await updateConnectorConnectionId(
        newConnectionId,
        provider
      );
      if (updateRes.error) {
        window.alert(updateRes.error);
      }

      if (connector && connector.type === "google_drive") {
        setGoogleDrivePickerOpen(true);
      }
    } else if (provider === "github") {
      const installationId = await githubAuth(githubAppUrl).catch((e) => {
        console.error(e);
      });

      if (!installationId) {
        window.alert(
          "Failed to update the Github permissions. Please contact-us at team@dust.tt"
        );
      } else {
        const updateRes = await updateConnectorConnectionId(
          installationId,
          provider
        );
        if (updateRes.error) {
          window.alert(updateRes.error);
        }
      }
    }
  };

  const updateConnectorConnectionId = async (
    newConnectionId: string,
    provider: string
  ) => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connectionId: newConnectionId }),
      }
    );

    if (res.ok) {
      return { success: true, error: null };
    }

    const jsonErr = await res.json();
    const error = jsonErr.error;

    if (error.type === "connector_oauth_target_mismatch") {
      if (provider === "slack") {
        return {
          success: false,
          error: `You cannot select another Slack Team.\nPlease contact us at team@dust.tt if you initially selected the wrong Team.`,
        };
      }
      if (provider === "notion") {
        return {
          success: false,
          error:
            "You cannot select another Notion Workspace.\nPlease contact us at team@dust.tt if you initially selected a wrong Workspace.",
        };
      }
      if (provider === "github") {
        return {
          success: false,
          error:
            "You cannot select another Github Organization.\nPlease contact us at team@dust.tt if you initially selected a wrong Organization.",
        };
      }
      if (provider === "google_drive") {
        return {
          success: false,
          error:
            "You cannot select another Google Drive Domain.\nPlease contact us at team@dust.tt if you initially selected a wrong shared Drive.",
        };
      }
    }
    return {
      success: false,
      error: `Failed to update the permissions of the Data Source: (contact team@dust.tt for assistance)`,
    };
  };

  return (
    <>
      {connector && connector?.type == "google_drive" && (
        <GoogleDriveFoldersPickerModal
          owner={owner}
          connectorId={connector.id}
          isOpen={googleDrivePickerOpen}
          setOpen={setGoogleDrivePickerOpen}
        />
      )}
      {connector && (
        <ConnectorPermissionsModal
          owner={owner}
          connector={connector}
          dataSource={dataSource}
          isOpen={showPermissionModal}
          setOpen={setShowPermissionModal}
          onEditPermission={() => {
            void handleUpdatePermissions();
          }}
        />
      )}

      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
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

            <div className="flex flex-row">
              <Button
                type="tertiary"
                onClick={() => {
                  setShowPermissionModal(true);
                }}
                label="Show permissions"
              ></Button>
            </div>
          </div>
          <div className="mt-2 sm:col-span-6">
            <div className="flex justify-between">
              <label
                htmlFor="assistantDefaultSelected"
                className="block text-sm font-medium text-gray-700"
              >
                Automatically select this DataSource for Assistant queries
              </label>
            </div>
            <div className="mt-2 flex items-center">
              <input
                id="assistantDefaultSelected"
                name="assistantDefaultSected"
                type="checkbox"
                className="h-4 w-4 cursor-pointer border-gray-300 text-action-600 focus:ring-action-500"
                checked={assistantDefaultSelected}
                onChange={(e) => setAssistantDefaultSelected(e.target.checked)}
              />
              <p className="ml-3 block text-sm text-sm font-normal text-gray-500">
                The assistant will use the DataSource by default when answering
                questions. Users can still choose not to use the DataSource for
                a given conversation with the assistant by clicking on the
                DataSource's icon below the chat input.
              </p>
            </div>
          </div>
        </div>
        <div className="flex pt-6">
          <div className="flex">
            <Button
              onClick={() => {
                void handleUpdate({
                  assistantDefaultSelected,
                });
              }}
              disabled={isUpdating}
              label={isUpdating ? "Updating..." : "Update"}
            />
          </div>
        </div>
      </div>
    </>
  );
}
