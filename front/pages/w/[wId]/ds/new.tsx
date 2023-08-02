import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { Button } from "@app/components/Button";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { classNames } from "@app/lib/utils";
import { DataSourceType, DataSourceVisibility } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  dataSources: DataSourceType[];
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

  const dataSources = await getDataSources(auth);

  return {
    props: {
      user,
      owner,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourceNew({
  user,
  owner,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disabled, setDisabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const [dataSourceName, setDataSourceName] = useState("");
  const [dataSourceNameError, setDataSourceNameError] = useState("");

  const [dataSourceDescription, setDataSourceDescription] = useState("");
  const [dataSourceVisibility, setDataSourceVisibility] = useState(
    "public" as DataSourceVisibility
  );

  const formValidation = () => {
    let exists = false;
    dataSources.forEach((d) => {
      if (d.name == dataSourceName) {
        exists = true;
      }
    });
    if (exists) {
      setDataSourceNameError("A DataSource with the same name already exists");
      return false;
    } else if (dataSourceName.length == 0) {
      setDataSourceNameError("");
      return false;
    } else if (dataSourceName.startsWith("managed-")) {
      setDataSourceNameError(
        "DataSource name cannot start with the prefix `managed-`"
      );
      return false;
      // eslint-disable-next-line no-useless-escape
    } else if (!dataSourceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setDataSourceNameError(
        "DataSource name must only contain letters, numbers, and the characters `._-`"
      );
      return false;
    } else {
      setDataSourceNameError("");
      return true;
    }
  };

  useEffect(() => {
    setDisabled(!formValidation());
  }, [dataSourceName]);

  const router = useRouter();

  const handleCreate = async () => {
    setCreating(true);
    const res = await fetch(`/api/w/${owner.sId}/data_sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: dataSourceName,
        description: dataSourceDescription,
        visibility: dataSourceVisibility,
      }),
    });
    if (res.ok) {
      await router.push(`/w/${owner.sId}/ds/${dataSourceName}`);
    } else {
      const err = (await res.json()) as { error: APIError };
      setCreating(false);
      window.alert(`Error creating DataSource: ${err.error.message}`);
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "data_sources" })}
    >
      <div className="flex flex-col">
        <div className="flex flex-1">
          <div className="mt-8 space-y-8 divide-y divide-gray-200">
            <div className="space-y-4 divide-y divide-gray-200">
              <div>
                <h3 className="text-base font-medium leading-6 text-gray-900">
                  Create a new DataSource
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  A Data Source enables you to upload text documents (by API or
                  manually) to perform semantic search on them. The documents
                  are automatically chunked and embedded using the model you
                  specify here.
                </p>
              </div>
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
                          "block w-full min-w-0 flex-1 rounded-none rounded-r-md border border-gray-300 bg-structure-50 p-1 text-sm",
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
                        className="block w-full min-w-0 flex-1 rounded-md border border-gray-300  bg-structure-50 p-1 text-sm focus:border-action-500 focus:ring-action-500"
                        value={dataSourceDescription}
                        onChange={(e) =>
                          setDataSourceDescription(e.target.value)
                        }
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      A good description will help others discover and
                      understand the purpose of your Data Source.
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
                            className="h-4 w-4 cursor-pointer border-gray-300 text-action-600 focus:ring-action-500"
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
                              Anyone on the Internet can discover and access
                              your DataSource. Only you can edit.
                            </p>
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input
                            id="dataSourceVisibilityPrivate"
                            name="visibility"
                            type="radio"
                            value="private"
                            className="h-4 w-4 cursor-pointer border-gray-300 text-action-600 focus:ring-action-500"
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
            </div>

            <div className="pt-6">
              <div className="flex">
                <Button
                  disabled={disabled || creating}
                  onClick={async () => {
                    await handleCreate();
                  }}
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
