import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/data_source/MainTab";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { Button } from "@app/components/Button";
import { useSession } from "next-auth/react";
import React, { useState, useEffect, useRef } from "react";
import { classNames } from "@app/lib/utils";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import ModelPicker from "@app/components/app/ModelPicker";
import { useRouter } from "next/router";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function New({ dataSource, user, ga_tracking_id }) {
  const { data: session } = useSession();

  let dataSourceConfig = JSON.parse(dataSource.config);

  const [dataSourceDescription, setDataSourceDescription] = useState(
    dataSource.description || ""
  );
  const [dataSourceVisibility, setDataSourceVisibility] = useState(
    dataSource.visibility
  );

  const router = useRouter();

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this DataSource?")) {
      let res = await fetch(`/api/data_sources/${user}/${dataSource.name}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push(`/${session.user.username}/data_sources`);
      }
      return true;
    } else {
      return false;
    }
  };

  return (
    <AppLayout
      ga_tracking_id={ga_tracking_id}
      dataSource={{ name: dataSource.name }}
    >
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            currentTab="Settings"
            user={user}
            readOnly={false}
            dataSource={dataSource}
          />
        </div>
        <div className="">
          <div className="mx-auto max-w-4xl px-2 mt-8">
            <form
              action={`/api/data_sources/${session.user.username}/${dataSource.name}`}
              method="POST"
              className="space-y-8 divide-y divide-gray-200 mt-8"
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
                        <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 pl-3 pr-1 text-gray-500 text-sm">
                          {session.user.username}
                          <ChevronRightIcon
                            className="h-5 w-5 flex-shrink-0 text-gray-400 pt-0.5"
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
                        <div className="font-normal text-gray-400 text-sm">
                          optional
                        </div>
                      </div>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          name="description"
                          id="dataSourceDescription"
                          className="block w-full min-w-0 flex-1 rounded-md border-gray-300 focus:border-violet-500 focus:ring-violet-500 text-sm"
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
                              className="h-4 w-4 border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                              value="public"
                              checked={dataSourceVisibility == "public"}
                              onChange={(e) => {
                                if (e.target.value != dataSourceVisibility) {
                                  setDataSourceVisibility(e.target.value);
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
                              className="h-4 w-4 border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                              checked={dataSourceVisibility == "private"}
                              onChange={(e) => {
                                if (e.target.value != dataSourceVisibility) {
                                  setDataSourceVisibility(e.target.value);
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
                          user={user}
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
                      <div className="mt-1 flex rounded-md shadow-sm w-32">
                        <input
                          type="number"
                          name="max_chunk_size"
                          id="dataSourceMaxChunkSize"
                          className="block w-full min-w-0 flex-1 rounded-md border-gray-300 focus:border-violet-500 focus:ring-violet-500 text-sm"
                          value={dataSourceConfig.max_chunk_size}
                          readOnly={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 flex">
                <div className="flex">
                  <Button type="submit">Update</Button>
                </div>
                <div className="flex-1"></div>
                <div className="flex ml-2">
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

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  if (!session) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != session.user.username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const [res] = await Promise.all([
    fetch(
      `${URL}/api/data_sources/${context.query.user}/${context.query.name}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: context.req.headers.cookie,
        },
      }
    ),
  ]);

  if (res.status === 404) {
    return {
      notFound: true,
    };
  }

  const [dataSource] = await Promise.all([res.json()]);

  return {
    props: {
      session,
      user: context.query.user,
      dataSource: dataSource.dataSource,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
