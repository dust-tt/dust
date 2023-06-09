import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import AppLayout from "@app/components/AppLayout";
import { ActionButton, Button } from "@app/components/Button";
import MainTab from "@app/components/data_source/MainTab";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import {
  getDisplayNameForDocument,
  getProviderLogoPathForDataSource,
} from "@app/lib/data_sources";
import { useDocuments } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
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

  const dataSource = await getDataSource(auth, context.params?.name as string);
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  // Managed data sources are read-only (you can't add a document).
  const readOnly = !auth.isBuilder() || !!dataSource.connectorId;

  return {
    props: {
      user,
      owner,
      readOnly,
      dataSource,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourceView({
  user,
  owner,
  readOnly,
  dataSource,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { mutate } = useSWRConfig();

  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const { documents, total } = useDocuments(owner, dataSource, limit, offset);

  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});

  const documentPoviderIconPath = getProviderLogoPathForDataSource(dataSource);

  useEffect(
    () =>
      setDisplayNameByDocId(
        documents.reduce(
          (acc, doc) =>
            Object.assign(acc, {
              [doc.document_id]: getDisplayNameForDocument(doc),
            }),
          {}
        )
      ),
    [documents]
  );

  let last = offset + limit;
  if (offset + limit > total) {
    last = total;
  }

  const handleDelete = async (documentId: string) => {
    if (
      confirm(
        "Are you sure you you want to delete this document (and associated chunks)?"
      )
    ) {
      await fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
        {
          method: "DELETE",
        }
      );
      await mutate(
        `/api/w/${owner.sId}/data_sources/${dataSource.name}/documents?limit=${limit}&offset=${offset}`
      );
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
            currentTab="Documents"
            owner={owner}
            dataSource={dataSource}
          />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-4xl px-4">
            <div className="flex flex-row">
              <div className="flex flex-initial"></div>
              <div className="flex flex-1">
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
                    {total > 0 && (
                      <span>
                        Showing documents {offset + 1} - {last} of {total}{" "}
                        documents
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {readOnly ? null : (
                <div className="">
                  <div className="mt-0 flex-none">
                    <Link
                      href={`/w/${owner.sId}/ds/${dataSource.name}/upsert`}
                      onClick={(e) => {
                        // Enforce plan limits: DataSource documents count.
                        if (
                          owner.plan.limits.dataSources.documents.count != -1 &&
                          total >= owner.plan.limits.dataSources.documents.count
                        ) {
                          e.preventDefault();
                          window.alert(
                            "Data Sources are limited to 32 documents on our free plan. Contact team@dust.tt if you want to increase this limit."
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

          <div className="mx-auto mt-8 max-w-4xl px-4">
            <div className="mt-8 overflow-hidden">
              <ul role="list" className="space-y-4">
                {documents.map((d) => (
                  <li
                    key={d.document_id}
                    className="group rounded border border-gray-300 px-2 px-4"
                  >
                    <Link
                      href={`/w/${owner.sId}/ds/${
                        dataSource.name
                      }/upsert?documentId=${encodeURIComponent(d.document_id)}`}
                      className="block"
                    >
                      <div className="mx-2 py-4">
                        <div className="grid grid-cols-5 items-center justify-between">
                          <div className="col-span-4">
                            <div className="flex">
                              {documentPoviderIconPath ? (
                                <div className="mr-1.5 mt-1 flex h-4 w-4 flex-initial">
                                  <img src={documentPoviderIconPath}></img>
                                </div>
                              ) : null}
                              <p className="truncate text-base font-bold text-violet-600">
                                {displayNameByDocId[d.document_id]}
                              </p>
                            </div>
                          </div>
                          <div className="col-span-1">
                            {readOnly ? null : (
                              <div className="ml-2 flex flex-row">
                                <div className="flex flex-1"></div>
                                <div className="flex flex-initial">
                                  <TrashIcon
                                    className="hidden h-4 w-4 text-gray-400 hover:text-red-700 group-hover:block"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      await handleDelete(d.document_id);
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
                        <p>No documents found for this Data Source.</p>
                        <p className="mt-2">
                          Sign-in to create your own Data Source.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>No documents found for this Data Source.</p>
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
