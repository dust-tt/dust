import type {
  DataSourceType,
  DocumentType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { classNames, timeAgoFrom } from "@app/lib/utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSource: DataSourceType;
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
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      dataSource,
      gaTrackingId: config.getGaTrackingId(),
    },
  };
});

export default function DataSourceView({
  owner,
  subscription,
  dataSource,
  gaTrackingId: gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});

  const router = useRouter();

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

  useEffect(() => {
    setError(false);
    let isCancelled = false;
    void (async () => {
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
        `/api/w/${owner.sId}/data_sources/${dataSource.name}/search?` +
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
  }, [dataSource.name, owner.sId, searchQuery]);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: dataSource.connectorId
          ? "data_sources_managed"
          : "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Search Data Source"
          onClose={() => {
            void router.push(
              `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
            );
          }}
        />
      }
      hideSidebar={true}
    >
      <div className="mt-8 flex flex-col">
        <div className="sm:col-span-6">
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              type="text"
              autoComplete="off"
              name="search_query"
              id="search_query"
              className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-action-500 focus:ring-action-500"
              onKeyDown={(e) => {
                if (e.key == "Enter") {
                  setSearchQuery(e.currentTarget.value);
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
                        <div className="truncate text-base font-bold text-action-600">
                          <div className="flex">
                            <Link
                              href={`/w/${owner.sId}/builder/data-sources/${
                                dataSource.name
                              }/upsert?documentId=${encodeURIComponent(
                                d.document_id
                              )}`}
                              className="block"
                            >
                              {displayNameByDocId[d.document_id]}
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 text-right">
                        <p className="text-align-right text-sm text-gray-500">
                          {timeAgoFrom(d.timestamp)} ago
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 justify-between space-y-2">
                      {d.chunks.map((chunk) => {
                        const chunkId = `chunk-key-${d.document_id}-${chunk.hash}}`;
                        return (
                          <div key={chunkId}>
                            <div
                              className={classNames(
                                "flex w-full flex-col rounded-sm"
                              )}
                            >
                              <div className="flex flex-initial items-center justify-center overflow-hidden">
                                <div className="flex flex-1 flex-row pb-1">
                                  <div className="flex-initial text-xs">
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
            <div className="mt-4 flex flex-col items-center justify-center text-sm text-gray-500">
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
                  return null;
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
    </AppLayout>
  );
}
