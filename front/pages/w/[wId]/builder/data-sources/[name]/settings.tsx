import { Button, DropdownMenu, TrashIcon } from "@dust-tt/sparkle";
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

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { getDataSource } from "@app/lib/api/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSource: DataSourceType;
  fetchConnectorError?: boolean;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const dataSource = await getDataSource(auth, context.params?.name as string);
  if (
    !dataSource ||
    (dataSource.connectorProvider &&
      !PROVIDERS_WITH_SETTINGS.includes(dataSource.connectorProvider))
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      dataSource,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function DataSourceSettings({
  owner,
  subscription,
  dataSource,
  gaTrackingId,
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
        `Failed to update the Folder (contact team@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
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
      gaTrackingId={gaTrackingId}
    />
  );
}

function StandardDataSourceSettings({
  owner,
  subscription,
  dataSource,
  handleUpdate,
  gaTrackingId,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSource: DataSourceType;
  handleUpdate: (settings: {
    description: string;
    assistantDefaultSelected: boolean;
  }) => Promise<void>;
  gaTrackingId: string;
}) {
  const { mutate } = useSWRConfig();

  const [dataSourceDescription, setDataSourceDescription] = useState(
    dataSource.description || ""
  );
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
      `/api/w/${owner.sId}/data_sources/${dataSource.name}`,
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
        `Failed to delete the Folder (contact team@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
    return true;
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
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
            <div className="flex">
              <DropdownMenu>
                <DropdownMenu.Button>
                  <Button
                    variant="secondaryWarning"
                    icon={TrashIcon}
                    label={"Delete this Folder"}
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items width={280}>
                  <div className="flex flex-col gap-y-4 px-4 py-4">
                    <div className="flex flex-col gap-y-2">
                      <div className="grow text-sm font-medium text-element-800">
                        Are you sure you want to delete?
                      </div>

                      <div className="text-sm font-normal text-element-700">
                        This will delete the Folder and all associated Documents
                        for everyone.
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <Button
                        variant="primaryWarning"
                        size="sm"
                        label={"Delete for Everyone"}
                        disabled={isSavingOrDeleting}
                        icon={TrashIcon}
                        onClick={async () => {
                          setIsSavingOrDeleting(true);
                          await handleDelete();
                          setIsSavingOrDeleting(false);
                        }}
                      />
                    </div>
                  </div>
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
