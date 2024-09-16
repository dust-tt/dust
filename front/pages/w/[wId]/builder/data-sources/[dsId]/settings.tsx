import { Button, TrashIcon } from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { PROVIDERS_WITH_SETTINGS } from "@dust-tt/types";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { classNames } from "@app/lib/utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSource: DataSourceType;
  fetchConnectorError?: boolean;
  dataSourceUsage: number;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  if (!auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const { dsId } = context.params || {};
  if (typeof dsId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(auth, dsId, {
    includeEditedBy: true,
    // TODO(DATASOURCE_SID): Clean-up
    origin: "data_source_builder_settings",
  });
  if (
    !dataSource ||
    (dataSource.connectorProvider &&
      !PROVIDERS_WITH_SETTINGS.includes(dataSource.connectorProvider))
  ) {
    return {
      notFound: true,
    };
  }

  const dataSourceUsageRes = await dataSource.getUsagesByAgents(auth);

  return {
    props: {
      owner,
      subscription,
      dataSource: dataSource.toJSON(),
      dataSourceUsage: dataSourceUsageRes.isOk() ? dataSourceUsageRes.value : 0,
    },
  };
});

export default function DataSourceSettings({
  owner,
  subscription,
  dataSource,
  dataSourceUsage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const handleUpdate = async (
    settings:
      | {
          description: string;
          assistantDefaultSelected: boolean;
        }
      | { assistantDefaultSelected: boolean }
  ) => {
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
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to update the Folder (contact support@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
  };
  return (
    <StandardDataSourceSettings
      owner={owner}
      subscription={subscription}
      dataSource={dataSource}
      handleUpdate={(settings: {
        description: string;
        assistantDefaultSelected: boolean;
      }) => handleUpdate(settings)}
      dataSourceUsage={dataSourceUsage}
    />
  );
}

function StandardDataSourceSettings({
  owner,
  subscription,
  dataSource,
  handleUpdate,
  dataSourceUsage,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSource: DataSourceType;
  handleUpdate: (settings: {
    description: string;
    assistantDefaultSelected: boolean;
  }) => Promise<void>;
  dataSourceUsage: number;
}) {
  const { mutate } = useSWRConfig();

  const [dataSourceDescription, setDataSourceDescription] = useState(
    dataSource.description || ""
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSavingOrDeleting, setIsSavingOrDeleting] = useState(false);
  const [isEdited, setIsEdited] = useState(false);

  const router = useRouter();

  const formValidation = useCallback(() => {
    let edited = false;
    if (dataSourceDescription !== dataSource.description) {
      edited = true;
    }
    setIsEdited(edited);
  }, [dataSource, dataSourceDescription]);

  useEffect(() => {
    formValidation();
  }, [formValidation]);

  const handleDelete = async () => {
    setIsSavingOrDeleting(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}`,
      {
        method: "DELETE",
      }
    );
    if (res.ok) {
      await mutate(`/api/w/${owner.sId}/data_sources`);
      await router.push(`/w/${owner.sId}/builder/data-sources/static`);
    } else {
      setIsSavingOrDeleting(false);
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to delete the Folder (contact support@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
    return true;
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title="Folder Settings"
          onCancel={() => {
            void router.push(
              `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
            );
          }}
          onSave={
            isEdited
              ? async () => {
                  setIsSavingOrDeleting(true);
                  await handleUpdate({
                    description: dataSourceDescription,
                    assistantDefaultSelected:
                      dataSource.assistantDefaultSelected,
                  });
                  setIsSavingOrDeleting(false);
                }
              : undefined
          }
          isSaving={isSavingOrDeleting}
        />
      }
      hideSidebar={true}
    >
      <div className="flex flex-col pt-8">
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label
              htmlFor="dataSourceName"
              className="block text-sm font-medium text-gray-700"
            >
              Folder Name
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
              <div className="text-sm font-normal text-gray-400">optional</div>
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
              purpose of your Folder.
            </p>
          </div>

          <div className="flex py-16">
            <Button
              variant="secondaryWarning"
              icon={TrashIcon}
              label={"Delete this Folder"}
              onClick={() => {
                setIsDeleteModalOpen(true);
              }}
            />
            <DeleteStaticDataSourceDialog
              dataSource={dataSource}
              handleDelete={handleDelete}
              isOpen={isDeleteModalOpen}
              onClose={() => setIsDeleteModalOpen(false)}
              dataSourceUsage={dataSourceUsage}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
