import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import ModelPicker from "@app/components/app/ModelPicker";
import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/data_source/MainTab";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { DataSourceType, DataSourceVisibility } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  dataSource: DataSourceType;
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

  let dataSource = await getDataSource(auth, context.params?.name as string);
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      dataSource,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourceSettings({
  user,
  owner,
  dataSource,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let dataSourceConfig = JSON.parse(dataSource.config || "{}");

  const [dataSourceDescription, setDataSourceDescription] = useState(
    dataSource.description || ""
  );
  const [dataSourceVisibility, setDataSourceVisibility] = useState(
    dataSource.visibility
  );

  const router = useRouter();

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this DataSource?")) {
      let res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.name}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        router.push(`/w/${owner.sId}/ds`);
      }
      return true;
    } else {
      return false;
    }
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      dataSource={dataSource}
    >
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab
            currentTab="Settings"
            owner={owner}
            dataSource={dataSource}
          />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-4xl px-2">
            <form
              action={`/api/w/${owner.sId}/data_sources/${dataSource.name}`}
              method="POST"
              className="mt-8 space-y-8 divide-y divide-gray-200"
            >
              <div className="space-y-8 divide-y divide-gray-200">
                <div>
                  <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
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
                            "block w-full min-w-0 flex-1 rounded-none rounded-r-md text-sm",
                            "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
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
                          className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-violet-500 focus:ring-violet-500"
                          value={dataSourceDescription}
                          onChange={(e) =>
                            setDataSourceDescription(e.target.value)
                          }
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        A good description will help others discover and
                        understand the purpose of your data source.
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
                  <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
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
                          onModelUpdate={(model) => {}}
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
                          className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-violet-500 focus:ring-violet-500"
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
                  <Button type="submit">Update</Button>
                </div>
                <div className="flex-1"></div>
                <div className="ml-2 flex">
                  <Button onClick={handleDelete}>Delete</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
