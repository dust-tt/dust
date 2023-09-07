import { Button, Checkbox } from "@dust-tt/sparkle";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import { mutate } from "swr";

import ModelPicker from "@app/components/app/ModelPicker";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ConnectorsAPI, ConnectorType } from "@app/lib/connectors_api";
import { getProviderLogoPathForDataSource } from "@app/lib/data_sources";
import { APIError } from "@app/lib/error";
import { classNames } from "@app/lib/utils";
import { DataSourceType, DataSourceVisibility } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  dataSource: DataSourceType;
  connector?: ConnectorType | null;
  fetchConnectorError?: boolean;
  gaTrackingId: string;
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
  if (dataSource.connectorId) {
    const connectorRes = await ConnectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
    }
  }

  return {
    props: {
      user,
      owner,
      dataSource,
      connector,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourceSettings({
  user,
  owner,
  dataSource,
  connector,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const managed = !!dataSource.connectorId && !!connector;
  const [isUpdating, setIsUpdating] = useState(false);

  const router = useRouter();

  const handleUpdate = async (
    settings:
      | {
          description: string;
          visibility: DataSourceVisibility;
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
      await router.push(
        `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
      );
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
            void router.push(
              `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
            );
          }}
        />
      }
    >
      <div className="mt-8 flex flex-col">
        {!managed ? (
          <StandardDataSourceSettings
            dataSource={dataSource}
            owner={owner}
            handleUpdate={(settings: {
              description: string;
              visibility: DataSourceVisibility;
              assistantDefaultSelected: boolean;
            }) => handleUpdate(settings)}
            isUpdating={isUpdating}
          />
        ) : (
          <ManagedDataSourceSettings
            dataSource={dataSource}
            owner={owner}
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
    if (window.confirm("Are you sure you want to delete this Data Source?")) {
      setIsDeleting(true);
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.name}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        await mutate(`/api/w/${owner.sId}/data_sources`);
        await router.push(`/w/${owner.sId}/builder/data-sources`);
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
                Data Source Name
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
                  Automatically select this Data Source for Assistant queries
                </label>
              </div>
              <div className="mt-2 flex items-center">
                <Checkbox
                  checked={assistantDefaultSelected}
                  onChange={(checked) => setAssistantDefaultSelected(checked)}
                />
                <p className="ml-3 block text-sm text-sm font-normal text-gray-500">
                  The assistant defaults to using the Data Source for answers.
                  However, users can opt out for a conversation by clicking the
                  Data Source icon below the chat input.
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
            variant="secondaryWarning"
            onClick={handleDelete}
            disabled={isDeleting || isUpdating}
            label={isDeleting ? "Deleting..." : "Delete"}
          />
        </div>
        <div className="flex-1"></div>
        <div className="ml-2 flex">
          <Button
            variant="tertiary"
            onClick={() => {
              void router.push(
                `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
              );
            }}
            disabled={isDeleting || isUpdating}
            label={"Cancel"}
          />
        </div>
        <div className="ml-2 flex">
          <Button
            variant="secondary"
            onClick={() => {
              void handleUpdate({
                description: dataSourceDescription,
                visibility: "private",
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

function ManagedDataSourceSettings({
  owner,
  dataSource,
  handleUpdate,
  isUpdating,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  handleUpdate: (settings: {
    assistantDefaultSelected: boolean;
  }) => Promise<void>;
  isUpdating: boolean;
}) {
  const router = useRouter();

  const [assistantDefaultSelected, setAssistantDefaultSelected] = useState(
    dataSource.assistantDefaultSelected
  );
  const logo = getProviderLogoPathForDataSource(dataSource);
  if (!logo) {
    throw new Error(`No logo for data source ${dataSource.name}`);
  }

  return (
    <>
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
          <div className="mt-2 sm:col-span-6">
            <div className="flex justify-between">
              <label
                htmlFor="assistantDefaultSelected"
                className="block text-sm font-medium text-gray-700"
              >
                Automatically select this Data Source for Assistant queries
              </label>
            </div>
            <div className="mt-2 flex items-center">
              <Checkbox
                checked={assistantDefaultSelected}
                onChange={(checked) => setAssistantDefaultSelected(checked)}
              />
              <p className="ml-3 block text-sm text-sm font-normal text-gray-500">
                The assistant defaults to using the Data Source for answers.
                However, users can opt out for a conversation by clicking the
                Data Source icon below the chat input.
              </p>
            </div>
          </div>
        </div>
        <div className="flex">
          <div className="flex flex-1"></div>
          <div className="ml-2 flex">
            <Button
              variant="tertiary"
              onClick={() => {
                void router.push(
                  `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
                );
              }}
              disabled={isUpdating}
              label={"Cancel"}
            />
          </div>
          <div className="ml-2 flex">
            <Button
              variant="secondary"
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
