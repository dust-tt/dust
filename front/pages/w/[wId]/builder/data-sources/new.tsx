import { Page } from "@dust-tt/sparkle";
import type { SubscriptionType } from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { isDataSourceNameValid } from "@dust-tt/types";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const dataSources = await getDataSources(auth);

  return {
    props: {
      owner,
      subscription,
      dataSources: dataSources.map((ds) => ds.toJSON()),
      gaTrackingId: config.getGaTrackingId(),
    },
  };
});

export default function DataSourceNew({
  owner,
  subscription,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isSaving, setIsSaving] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [isValid, setIsValid] = useState(true);

  const [dataSourceName, setDataSourceName] = useState("");
  const [dataSourceNameError, setDataSourceNameError] = useState("");
  const [dataSourceDescription, setDataSourceDescription] = useState("");

  const formValidation = useCallback(() => {
    let edited = false;
    let valid = true;

    let exists = false;
    dataSources.forEach((d) => {
      if (d.name == dataSourceName) {
        exists = true;
      }
    });
    const nameValidRes = isDataSourceNameValid(dataSourceName);
    if (exists) {
      setDataSourceNameError("A Folder with the same name already exists");
      valid = false;
    } else if (nameValidRes.isErr()) {
      setDataSourceNameError(nameValidRes.error);
      valid = false;
    } else {
      edited = true;
      setDataSourceNameError("");
    }

    if (dataSourceDescription.length > 0) {
      edited = true;
    }

    setIsEdited(edited);
    setIsValid(valid);
  }, [dataSourceName, dataSourceDescription, dataSources]);

  useEffect(() => {
    formValidation();
  }, [formValidation]);

  const router = useRouter();

  const handleCreate = async () => {
    setIsSaving(true);
    const res = await fetch(`/api/w/${owner.sId}/data_sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: dataSourceName,
        description: dataSourceDescription,
        assistantDefaultSelected: false,
      }),
    });
    if (res.ok) {
      await router.push(`/w/${owner.sId}/builder/data-sources/static`);
    } else {
      const err = (await res.json()) as { error: APIError };
      setIsSaving(false);
      window.alert(`Error creating DataSource: ${err.error.message}`);
    }
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title="Create a Folder"
          onSave={
            isValid && isEdited && !isSaving
              ? async () => {
                  await handleCreate();
                }
              : undefined
          }
          onCancel={() => {
            void router.push(`/w/${owner.sId}/builder/data-sources/static`);
          }}
        />
      }
      hideSidebar={true}
    >
      <div className="flex flex-1 flex-col space-y-4">
        <Page.SectionHeader
          title="Create a new Folder"
          description="A Folder allows you to upload text documents (via API or manually) to make them available to your assistants."
        />
        <div>
          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
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
                    "block w-full min-w-0 flex-1 rounded-none rounded-r-md text-sm",
                    dataSourceNameError
                      ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-action-500 focus:ring-action-500"
                  )}
                  value={dataSourceName}
                  onChange={(e) => setDataSourceName(e.target.value)}
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
                  className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-action-500 focus:ring-action-500"
                  value={dataSourceDescription}
                  onChange={(e) => setDataSourceDescription(e.target.value)}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                A good description will help users discover and understand the
                purpose of your Folder.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
