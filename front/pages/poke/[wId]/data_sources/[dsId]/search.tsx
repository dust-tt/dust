import type {
  DataSourceType,
  DocumentType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useState } from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { classNames, timeAgoFrom } from "@app/lib/utils";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  dataSource: DataSourceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { dsId } = context.params || {};
  if (typeof dsId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(auth, dsId, {
    includeEditedBy: true,
    // TODO(DATASOURCE_SID): Clean-up
    origin: "poke_data_sources_page_search",
  });
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      dataSource: dataSource.toJSON(),
    },
  };
});

export default function DataSourceView({
  owner,
  dataSource,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});

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
        `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.name}/search?` +
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

  const onDisplayDocumentSource = (documentId: string) => {
    if (
      window.confirm(
        "Are you sure you want to access this sensible user data? (Access will be logged)"
      )
    ) {
      window.open(
        `/poke/${owner.sId}/data_sources/${
          dataSource.name
        }/view?documentId=${encodeURIComponent(documentId)}`
      );
    }
  };

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl">
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
                              <div
                                onClick={() =>
                                  onDisplayDocumentSource(d.document_id)
                                }
                                className="cursor-pointer"
                              >
                                {displayNameByDocId[d.document_id]}
                              </div>
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
      </div>
    </div>
  );
}
