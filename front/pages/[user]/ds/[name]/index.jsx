import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/data_source/MainTab";
import { timeAgoFrom } from "@app/lib/utils";
import { ActionButton, Button } from "@app/components/Button";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { useState } from "react";
import { useDocuments } from "@app/lib/swr";
import { auth_user } from "@app/lib/auth";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function DataSourceView({
  owner,
  readOnly,
  dataSource,
  ga_tracking_id,
}) {
  const { mutate } = useSWRConfig();

  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  let { documents, total, isDocumentsLoading, isDocumentsError } = useDocuments(
    owner.username,
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
        `/api/data_sources/${owner.username}/${
          dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
        {
          method: "DELETE",
        }
      );
      mutate(
        `/api/data_sources/${owner.username}/${dataSource.name}/documents?limit=${limit}&offset=${offset}`
      );
    }
  };

  return (
    <AppLayout
      ga_tracking_id={ga_tracking_id}
      dataSource={{ name: dataSource.name }}
    >
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab
            currentTab="Documents"
            owner={owner}
            readOnly={readOnly}
            dataSource={dataSource}
          />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-4xl px-2">
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
                        <div className="ml-2 flex">
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

                    <div className="mt-3 flex flex-auto pl-1 text-sm text-gray-700">
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
                      href={`/${owner.username}/ds/${dataSource.name}/upsert`}
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
                      <ActionButton>
                        <PlusIcon className="-ml-1 mr-1 h-4 w-4" />
                        Upload Document
                      </ActionButton>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-4xl px-2">
            <div className="mt-8 overflow-hidden">
              <ul role="list" className="space-y-4">
                {documents.map((d) => (
                  <li
                    key={d.document_id}
                    className="group rounded border border-gray-300 px-2 px-4"
                  >
                    <Link
                      href={`/${owner.username}/ds/${
                        dataSource.name
                      }/upsert?documentId=${encodeURIComponent(d.document_id)}`}
                      className="block"
                    >
                      <div className="mx-2 py-4">
                        <div className="grid grid-cols-5 items-center justify-between">
                          <div className="col-span-4">
                            <p className="truncate text-base font-bold text-violet-600">
                              {d.document_id}
                            </p>
                          </div>
                          <div className="col-span-1">
                            {readOnly ? null : (
                              <div className="ml-2 flex flex-row">
                                <div className="flex flex-1"></div>
                                <div className="flex flex-initial">
                                  <TrashIcon
                                    className="hidden h-4 w-4 text-gray-400 hover:text-red-700 group-hover:block"
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
                          <div className="mt-0 flex items-center">
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
                  <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
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
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  let auth = authRes.value();

  let readOnly =
    auth.isAnonymous() || context.query.user !== auth.user().username;

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
    return { notFound: true };
  }

  const [dataSource] = await Promise.all([res.json()]);

  return {
    props: {
      session: auth.session(),
      owner: { username: context.query.user },
      readOnly,
      dataSource: dataSource.dataSource,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
