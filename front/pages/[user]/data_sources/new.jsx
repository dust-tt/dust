import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/profile/MainTab";
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

export default function New({ dataSources, user, ga_tracking_id }) {
  const { data: session } = useSession();

  const [disabled, setDisabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const [dataSourceName, setDataSourceName] = useState("");
  const [dataSourceNameError, setDataSourceNameError] = useState(null);

  const [dataSourceDescription, setDataSourceDescription] = useState("");
  const [dataSourceVisibility, setDataSourceVisibility] = useState("public");
  const [dataSourceModel, setDataSourceModel] = useState({
    provider_id: "",
    model_id: "",
  });
  const [dataSourceMaxChunkSize, setDataSourceMaxChunkSize] = useState(256);

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
      setDataSourceNameError(null);
      return false;
    } else if (!dataSourceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setDataSourceNameError(
        "DataSource name must only contain letters, numbers, and the characters `._-`"
      );
      return false;
    } else {
      setDataSourceNameError(null);
      return true;
    }
  };

  useEffect(() => {
    setDisabled(
      !formValidation() ||
        !dataSourceModel.provider_id ||
        !dataSourceModel.model_id
    );
  }, [dataSourceName, dataSourceModel]);

  const router = useRouter();

  const handleCreate = async () => {
    const res = await fetch(`/api/data_sources/${session.user.username}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: dataSourceName,
        description: dataSourceDescription,
        visibility: dataSourceVisibility,
        provider_id: dataSourceModel.provider_id,
        model_id: dataSourceModel.model_id,
        max_chunk_size: `${dataSourceMaxChunkSize}`,
      }),
    });
    router.push(`/${session.user.username}/ds/${dataSourceName}`);
  };

  return (
    <AppLayout ga_tracking_id={ga_tracking_id}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="DataSources" />
        </div>
        <div className="flex flex-1">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mt-8 space-y-8 divide-y divide-gray-200">
              <div className="space-y-8 divide-y divide-gray-200">
                <div>
                  <h3 className="text-base font-medium leading-6 text-gray-900">
                    Create a new DataSource
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    A data source enables you to upload text documents (by API
                    or manually) to perform semantic search on them. The
                    documents are automatically chunked and embedded using the
                    model you specify here.
                  </p>
                </div>
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
                          {session.user.username}
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
                              : "border-gray-300 focus:border-violet-500 focus:ring-violet-500"
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
                              className="h-4 w-4 cursor-pointer border-gray-300 text-violet-600 focus:ring-violet-500"
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
                          readOnly={false}
                          model={dataSourceModel}
                          onModelUpdate={(model) => {
                            setDataSourceModel(model);
                          }}
                          chatOnly={false}
                          embedOnly={true}
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        The embedder is the model that will be used by the data
                        source to embed documents' chunks and search queries.
                      </p>
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
                          value={dataSourceMaxChunkSize}
                          onChange={(e) =>
                            setDataSourceMaxChunkSize(e.target.value)
                          }
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        The (maximum) number of tokens used to chunk the
                        documents. 256 tokens is recommended.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flex">
                  <Button
                    disabled={disabled || creating}
                    onClick={() => {
                      setCreating(true);
                      handleCreate();
                    }}
                  >
                    {creating ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </div>
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

  const [dataSourcesRes] = await Promise.all([
    fetch(`${URL}/api/data_sources/${context.query.user}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
  ]);

  if (dataSourcesRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [dataSources] = await Promise.all([dataSourcesRes.json()]);

  return {
    props: {
      session,
      user: context.query.user,
      dataSources: dataSources.dataSources,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
