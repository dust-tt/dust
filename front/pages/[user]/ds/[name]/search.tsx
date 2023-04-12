import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/data_source/MainTab";
import { auth_user } from "@app/lib/auth";
import { timeAgoFrom, utcDateFrom } from "@app/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

import { classNames } from "@app/lib/utils";
import { UserType } from "@app/types//user";
import { DataSourceType } from "@app/types/data_source";
import { DocumentType } from "@app/types/document";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function DataSourceView({
  dataSource,
  authUser,
  owner,
  gaTrackingId: gaTrackingId,
}: {
  dataSource: DataSourceType;
  authUser?: UserType;
  owner: {
    username: string;
  };
  gaTrackingId: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    setError(false);
    let isCancelled = false;
    (async () => {
      if (searchQuery.trim().length == 0) {
        setDocuments([]);

        return;
      }
      setIsLoading(true);
      const searchParams = new URLSearchParams();
      searchParams.append("query", searchQuery);
      searchParams.append("top_k", "10");
      searchParams.append("full_text", "false");

      const searchRes = await fetch(
        `/api/data_sources/${owner.username}/${dataSource.name}/search?` +
          searchParams.toString(),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      setIsLoading(false);
      if (isCancelled) {
        return;
      }

      if (searchRes.ok) {
        setError(false);
        const documents = await searchRes.json();
        setDocuments(documents.documents);
      } else {
        setError(true);
        setDocuments([]);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [dataSource.name, searchQuery]);

  return (
    <AppLayout gaTrackingId={gaTrackingId} dataSource={dataSource}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab
            currentTab="Search"
            owner={owner}
            readOnly={false}
            dataSource={dataSource}
          />
        </div>

        <div className="">
          <div className="mx-auto mt-8 max-w-4xl px-2">
            <div className="sm:col-span-6">
              <div className="flex justify-between">
                <label
                  htmlFor="appDescription"
                  className="block text-sm font-medium text-gray-700"
                >
                  Search Documents
                </label>
              </div>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  autoComplete="off"
                  name="search_query"
                  id="search_query"
                  className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-violet-500 focus:ring-violet-500"
                  onKeyDown={(e) => {
                    if (e.key == "Enter") {
                      // @ts-expect-error e.target.value is not recognized as a property in this context. I don't know why.
                      setSearchQuery(e.target.value);
                    }
                  }}
                  placeholder="Search query..."
                />
              </div>
            </div>
            <div className="mt-8 overflow-hidden">
              <ul role="list" className="space-y-4">
                {!isLoading &&
                  documents.map((d: DocumentType) => (
                    <li
                      key={d.document_id}
                      className="group rounded border border-gray-300 px-2 px-4"
                    >
                      <div className="mx-2 py-4">
                        <div className="grid grid-cols-5 items-center justify-between">
                          <div className="col-span-4">
                            <p className="truncate text-base font-bold text-violet-600">
                              <Link
                                href={`/${owner.username}/ds/${
                                  dataSource.name
                                }/upsert?documentId=${encodeURIComponent(
                                  d.document_id
                                )}`}
                                className="block"
                              >
                                {d.document_id}
                              </Link>
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-between">
                          <div className="flex flex-initial">
                            <p className="text-sm text-gray-300">
                              {Math.floor(d.text_size / 1024)} kb /{" "}
                              {d.chunk_count} chunks{" "}
                            </p>
                          </div>
                          <div
                            className="mt-0 flex items-center"
                            title={utcDateFrom(d.timestamp)}
                          >
                            <p className="text-sm text-gray-500">
                              {timeAgoFrom(d.timestamp)} ago
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 justify-between">
                          {d.chunks.map((chunk) => {
                            const chunkId = `chunk-key-${d.document_id}-${chunk.hash}}`;
                            return (
                              <div key={chunkId} className="pb-4">
                                <div
                                  className={classNames(
                                    "flex w-full flex-col rounded-sm "
                                  )}
                                >
                                  <div className="flex flex-initial items-center justify-center overflow-hidden">
                                    <div className="flex flex-1 flex-row pb-1">
                                      <div className=" flex-initial text-xs">
                                        <span className="rounded bg-yellow-100 px-1 py-0.5 text-gray-500">
                                          Score:{" "}
                                          {chunk.score
                                            ? Math.round(chunk.score * 100)
                                            : "-"}
                                          %
                                        </span>
                                      </div>
                                      <div
                                        className="ml-2 mr-4 flex-1 cursor-pointer border-l-4 border-slate-400"
                                        onClick={() => {
                                          expandedChunkId == chunkId
                                            ? setExpandedChunkId(null)
                                            : setExpandedChunkId(chunkId);
                                        }}
                                      >
                                        <p
                                          className={`break-words pl-1 text-xs italic text-gray-500 ${
                                            expandedChunkId === chunkId
                                              ? ""
                                              : "line-clamp-2"
                                          } `}
                                        >
                                          {chunk.text}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </li>
                  ))}
                <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
                  {(() => {
                    if (error) {
                      return (
                        <p className="text-sm font-bold text-red-400">
                          Something went wrong...
                        </p>
                      );
                    }
                    if (isLoading) {
                      return <p>Searching...</p>;
                    }
                    if (
                      !isLoading &&
                      searchQuery.length == 0 &&
                      documents.length === 0
                    ) {
                      return <p>Please enter your search query.</p>;
                    }
                    if (
                      !isLoading &&
                      searchQuery.length > 0 &&
                      documents.length === 0
                    ) {
                      return <p>No document found.</p>;
                    }

                    return <></>;
                  })()}
                </div>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export async function getServerSideProps(context: any) {
  const authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  const auth = authRes.value;

  if (auth.isAnonymous()) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != auth.user().username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

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
    return { notFound: true };
  }

  const [dataSource] = await Promise.all([dataSourceRes.json()]);

  return {
    props: {
      session: auth.session(),
      authUser: auth.isAnonymous() ? null : auth.user(),
      owner: { username: context.query.user },
      dataSource: dataSource.dataSource,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
