import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { clientFetch } from "@app/lib/egress/client";
import { useRequiredPathParam } from "@app/lib/platform";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import { usePokeDataSourceDetails } from "@app/poke/swr/data_source_details";
import type { DocumentType } from "@app/types/document";
import { Input, Spinner } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

export function DataSourceSearchPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Search`);

  const dsId = useRequiredPathParam("dsId");
  const [searchQuery, setSearchQuery] = useState("");
  const [tagsIn, setTagsIn] = useState("");
  const [tagsNotIn, setTagsNotIn] = useState("");
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<boolean>(false);
  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});

  const {
    data: dataSourceDetails,
    isLoading,
    isError,
  } = usePokeDataSourceDetails({
    owner,
    dsId,
    disabled: false,
  });

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
    if (!dataSourceDetails) {
      return;
    }

    const { dataSource } = dataSourceDetails;

    setSearchError(false);
    let isCancelled = false;
    void (async () => {
      if (
        searchQuery.trim().length == 0 &&
        tagsIn.trim().length == 0 &&
        tagsNotIn.trim().length == 0
      ) {
        setDocuments([]);

        return;
      }
      setIsSearching(true);
      const searchParams = new URLSearchParams();
      if (searchQuery.trim().length > 0) {
        searchParams.append("query", searchQuery);
      }
      if (tagsIn.trim().length > 0) {
        searchParams.append("tags_in", tagsIn);
      }
      if (tagsNotIn.trim().length > 0) {
        searchParams.append("tags_not", tagsNotIn);
      }
      searchParams.append("top_k", "10");
      searchParams.append("full_text", "false");

      const searchRes = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/search?` +
          searchParams.toString(),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      setIsSearching(false);
      if (isCancelled) {
        return;
      }

      if (searchRes.ok) {
        setSearchError(false);
        const documentsResult = await searchRes.json();
        setDocuments(documentsResult.documents);
      } else {
        setSearchError(true);
        setDocuments([]);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [dataSourceDetails, owner.sId, searchQuery, tagsIn, tagsNotIn]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !dataSourceDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading data source details.</p>
      </div>
    );
  }

  const { dataSource } = dataSourceDetails;

  const onDisplayDocumentSource = (documentId: string) => {
    if (
      window.confirm(
        "Are you sure you want to access this sensible user data? (Access will be logged)"
      )
    ) {
      window.open(
        `/poke/${owner.sId}/data_sources/${dataSource.sId}/view?documentId=${encodeURIComponent(documentId)}`
      );
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col">
        <div className="sm:col-span-6">
          <div className="mt-1 flex rounded-md">
            <Input
              type="text"
              autoComplete="off"
              name="search_query"
              id="search_query"
              className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-highlight-500 focus:ring-highlight-500"
              onKeyDown={(e) => {
                if (e.key == "Enter") {
                  setSearchQuery(e.currentTarget.value);
                }
              }}
              placeholder="Search query..."
            />
          </div>
        </div>
        <div className="mt-4 sm:col-span-6">
          <div className="mt-1 flex rounded-md">
            <Input
              type="text"
              autoComplete="off"
              name="tags_in"
              id="tags_in"
              className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-highlight-500 focus:ring-highlight-500"
              onKeyDown={(e) => {
                if (e.key == "Enter") {
                  setTagsIn(e.currentTarget.value);
                }
              }}
              placeholder="Tags in..."
            />
          </div>
        </div>
        <div className="mt-4 sm:col-span-6">
          <div className="mt-1 flex rounded-md">
            <Input
              type="text"
              autoComplete="off"
              name="tags_not_in"
              id="tags_not_in"
              className="block w-full min-w-0 flex-1 rounded-md border-gray-300 text-sm focus:border-highlight-500 focus:ring-highlight-500"
              onKeyDown={(e) => {
                if (e.key == "Enter") {
                  setTagsNotIn(e.currentTarget.value);
                }
              }}
              placeholder="Tags not in..."
            />
          </div>
        </div>
        <div className="mt-8 overflow-hidden">
          <ul role="list" className="space-y-4">
            {!isSearching &&
              documents.map((d: DocumentType) => (
                <li
                  key={d.document_id}
                  className="group rounded border border-gray-300 px-2 px-4"
                >
                  <div className="mx-2 py-4">
                    <div className="grid grid-cols-5 items-center justify-between">
                      <div className="col-span-4">
                        <div className="truncate text-base font-bold text-highlight-600">
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
                                    className="ml-2 mr-4 flex-1 cursor-pointer border-l-4 border-border-dark"
                                    onClick={() => {
                                      // eslint-disable-next-line no-unused-expressions
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
                if (searchError) {
                  return (
                    <p className="copy-sm font-semibold text-warning">
                      Something went wrong...
                    </p>
                  );
                }
                if (isSearching) {
                  return <p>Searching...</p>;
                }
                if (
                  !isSearching &&
                  searchQuery.length == 0 &&
                  tagsIn.length == 0 &&
                  tagsNotIn.length == 0 &&
                  documents.length === 0
                ) {
                  return null;
                }
                if (
                  !isSearching &&
                  (searchQuery.length > 0 ||
                    tagsIn.length > 0 ||
                    tagsNotIn.length > 0) &&
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
  );
}
