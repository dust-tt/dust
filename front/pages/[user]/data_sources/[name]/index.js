import AppLayout from "../../../../components/app/AppLayout";
import MainTab from "../../../../components/profile/MainTab";
import { timeAgoFrom } from "../../../../lib/utils";
import { Button } from "../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSWRConfig } from "swr";
import { useState } from "react";
import { useDocuments } from "../../../../lib/swr";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function DataSourceView({
  dataSource,
  readOnly,
  user,
  ga_tracking_id,
}) {
  const { mutate } = useSWRConfig();
  const { data: session } = useSession();

  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  let { documents, total, isDocumentsLoading, isDocumentsError } = useDocuments(
    user,
    dataSource,
    limit,
    offset
  );

  let last = offset + limit;
  if (offset + limit > total) {
    last = total;
  }

  const handleDelete = async (documentId) => {
    if (
      confirm(
        "Are you sure you you want to delete this document (and associated chunks)?"
      )
    ) {
      let r = await fetch(
        `/api/data_sources/${session.user.username}/${dataSource.name}/documents/${documentId}`,
        {
          method: "DELETE",
        }
      );
      mutate(
        `/api/data_sources/${session.user.username}/${dataSource.name}/documents?limit=${limit}&offset=${offset}`
      );
    }
  };

  return (
    <AppLayout ga_tracking_id={ga_tracking_id}>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab current_tab="DataSources" user={user} readOnly={readOnly} />
        </div>
        <div className="">
          <div className="mx-auto max-w-4xl px-2 mt-8">
            <div className="flex flex-row">
              <div className="flex flex-initial"></div>
              <div className="flex flex-1">
                {documents.length > 0 ? (
                  <div className="flex flex-col">
                    <div className="flex flex-row">
                      <div className="flex flex-initial">
                        <div className="flex">
                          <Button
                            disabled={offset < limit}
                            onClick={() => {
                              if (offset >= limit) {
                                setOffset(offset - limit);
                              } else {
                                setOffset(0);
                              }
                            }}
                          >
                            Previous
                          </Button>
                        </div>
                        <div className="flex ml-2">
                          <Button
                            disabled={offset + limit >= total}
                            onClick={() => {
                              if (offset + limit < total) {
                                setOffset(offset + limit);
                              }
                            }}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-auto text-gray-700 text-sm mt-3 pl-1">
                      Showing documents {offset + 1} - {last} of {total}{" "}
                      documents
                    </div>
                  </div>
                ) : null}
              </div>
              {readOnly ? null : (
                <div className="">
                  <div className="mt-0 flex-none">
                    <Link
                      href={`/${session.user.username}/data_sources/${dataSource.name}/upsert`}
                      onClick={(e) => {
                        // Enforce FreePlan limit: 32 documents per DataSource.
                        if (total >= 32) {
                          e.preventDefault();
                          window.alert(
                            "DataSources are limited to 32 documents on our free plan. Contact team@dust.tt if you want to increase this limit."
                          );
                          return;
                        }
                      }}
                    >
                      <Button>
                        <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                        Upload Document
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto max-w-4xl px-2 mt-8">
            <div className="overflow-hidden mt-8">
              <ul role="list" className="space-y-4">
                {documents.map((d) => (
                  <li
                    key={d.document_id}
                    className="px-2 px-4 rounded border border-gray-300 group"
                  >
                    <Link
                      href={`/${user}/data_sources/${dataSource.name}/upsert?documentId=${d.document_id}`}
                      className="block"
                    >
                      <div className="py-4 mx-2">
                        <div className="grid grid-cols-5 items-center justify-between">
                          <div className="col-span-4">
                            <p className="truncate text-base font-bold text-violet-600">
                              {d.document_id}
                            </p>
                          </div>
                          <div className="col-span-1">
                            {readOnly ? null : (
                              <div className="flex flex-row ml-2">
                                <div className="flex flex-1"></div>
                                <div className="flex flex-initial">
                                  <TrashIcon
                                    className="h-4 w-4 hidden group-hover:block text-gray-400 hover:text-red-700"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleDelete(d.document_id);
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex justify-between">
                          <div className="flex flex-initial">
                            <p className="text-sm text-gray-300">
                              {Math.floor(d.text_size / 1024)} kb /{" "}
                              {d.chunk_count} chunks{" "}
                            </p>
                          </div>
                          <div className="flex items-center mt-0">
                            <p className="text-sm text-gray-500">
                              {timeAgoFrom(d.timestamp)} ago
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
                {documents.length == 0 ? (
                  <div className="flex flex-col items-center justify-center text-sm text-gray-500 mt-10">
                    {readOnly ? (
                      <>
                        <p>No documents found for this data source.</p>
                        <p className="mt-2">
                          Sign-in to create your own data source.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>No documents found for this data source.</p>
                        <p className="mt-2">
                          You can upload documents manually or by API.
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </ul>
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

  let readOnly = !session || context.query.user !== session.user.username;

  const [dataSourceRes] = await Promise.all([
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

  if (dataSourceRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [dataSource] = await Promise.all([dataSourceRes.json()]);

  return {
    props: {
      session,
      dataSource: dataSource.dataSource,
      readOnly,
      user: context.query.user,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
