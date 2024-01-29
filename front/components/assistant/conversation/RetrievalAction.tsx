import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  DocumentTextIcon,
  Icon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  RetrievalActionType,
  RetrievalDocumentType,
} from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { classNames } from "@app/lib/utils";

export default function RetrievalAction({
  retrievalAction,
}: {
  retrievalAction: RetrievalActionType;
}) {
  const { query, relativeTimeFrame, topK } = retrievalAction.params;
  const [docListVisible, setDocListVisible] = useState(false);

  function shortText(text: string, maxLength = 20) {
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }
  // exhaustive retrieval, checks whether max chunks was reached
  const tooManyChunks =
    retrievalAction.documents &&
    retrievalAction.documents
      .map((d) => d.chunks.length)
      .reduce((a, b) => a + b, 0) === topK;

  // retrieval date limit given the last document's timestamp
  const retrievalTsLimit =
    retrievalAction.documents &&
    retrievalAction.documents.length > 0 &&
    retrievalAction.documents[retrievalAction.documents.length - 1].timestamp;
  // turn the timestamp into a date (e.g. Oct 1st)
  const date = retrievalTsLimit && new Date(retrievalTsLimit);
  const retrievalDateLimit =
    date &&
    `${date.toLocaleString("default", {
      month: "short",
    })} ${date.getDate()}`;

  return (
    <>
      <div className="flex flex-row items-center gap-2 pb-2">
        <div className="text-xs font-bold text-element-600">
          Searching&nbsp;for:
        </div>
        <Chip.List isWrapping={true}>
          <Tooltip label="Docs created or updated during that time are included in the search">
            <Chip
              color="amber"
              label={
                relativeTimeFrame
                  ? "During the last " +
                    (relativeTimeFrame.duration > 1
                      ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
                      : `${relativeTimeFrame.unit}`)
                  : "All time"
              }
            />
          </Tooltip>
          {query && (
            <Tooltip label={`Query used for semantic search: ${query}`}>
              <Chip
                color="slate"
                label={query ? shortText(query) : "No query"}
              />
            </Tooltip>
          )}
          {!query && tooManyChunks && (
            <Tooltip
              label={`Too much data to retrieve in one go. Retrieved only ${topK} excerpts from the most recent ${retrievalAction.documents?.length} documents, up to ${retrievalDateLimit}`}
            >
              <Chip
                color="warning"
                label={`Warning: limited data retrieval (from now to ${retrievalDateLimit})`}
              />
            </Tooltip>
          )}
        </Chip.List>
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div className="grid-cols-auto grid items-center">
          {!retrievalAction.documents ? (
            <div>
              <div className="pb-2 text-xs font-bold text-element-600">
                Retrieving...
              </div>
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="text-xs font-bold text-element-600">
              <span>Retrieved:</span>
            </div>
          )}
        </div>
        <div className="row-span-1 select-none">
          {retrievalAction.documents && (
            <div
              onClick={() => setDocListVisible(!docListVisible)}
              className="cursor-pointer"
            >
              <Chip color="purple">
                {retrievalAction.documents.length > 0
                  ? RetrievedDocumentsInfo(retrievalAction.documents)
                  : "No documents found"}
                <Icon
                  visual={docListVisible ? ChevronDownIcon : ChevronRightIcon}
                  size="xs"
                />
              </Chip>
            </div>
          )}
        </div>
        <div className="col-start-2 row-span-1">
          {!!retrievalAction.documents?.length && (
            <Transition
              show={docListVisible}
              enter="transition ease-out duration-200 transform"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition ease-in duration-75 transform"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <ul className="ml-2 flex flex-col gap-y-2">
                {retrievalAction.documents.map((document, i) => {
                  const provider = providerFromDocument(document);
                  return (
                    <li key={i}>
                      <a
                        href={linkFromDocument(document)}
                        className="front-bold flex flex-row items-center text-xs text-element-800"
                        target="_blank"
                      >
                        {provider === "none" ? (
                          <DocumentTextIcon className="mr-1 inline-block h-4 w-4 text-slate-500" />
                        ) : (
                          <Icon
                            visual={
                              CONNECTOR_CONFIGURATIONS[provider].logoComponent
                            }
                            size="sm"
                            className="mr-1 inline-block"
                          />
                        )}
                        {titleFromDocument(document)}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Transition>
          )}
        </div>
      </div>
    </>
  );
}

function RetrievedDocumentsInfo(documents: RetrievalDocumentType[]) {
  const summary = documentsSummary(documents);
  return (
    <div className="flex flex-row items-center">
      <span className="hidden lg:block">{documents.length}&nbsp;results</span>
      {Object.keys(summary).map((k) => {
        const { provider } = summary[k];

        return (
          <div key={k} className="ml-3 flex flex-initial flex-row items-center">
            <div className={classNames("mr-1 flex")}>
              {provider !== "none" ? (
                <Icon
                  visual={CONNECTOR_CONFIGURATIONS[provider].logoComponent}
                  size="sm"
                  className="mr-1 inline-block"
                />
              ) : (
                <DocumentTextIcon className="h-4 w-4 text-slate-500" />
              )}
            </div>
            <div className="flex-initial text-gray-700">{summary[k].count}</div>
          </div>
        );
      })}
    </div>
  );
}

function documentsSummary(documents: RetrievalDocumentType[]): {
  [key: string]: { count: number; provider: ConnectorProvider | "none" };
} {
  const summary = {} as {
    [key: string]: { count: number; provider: ConnectorProvider | "none" };
  };
  documents.forEach((r: RetrievalDocumentType) => {
    const provider = providerFromDocument(r);
    if (r.dataSourceId in summary) {
      summary[r.dataSourceId].count += 1;
    } else {
      summary[r.dataSourceId] = {
        provider,
        count: 1,
      };
    }
  });
  return summary;
}

type ConnectorProviderDocumentType =
  | Exclude<ConnectorProvider, "intercom" | "webcrawler">
  | "none";

export function providerFromDocument(
  document: RetrievalDocumentType
): ConnectorProviderDocumentType {
  const providerMap: Record<string, ConnectorProviderDocumentType> = {
    "managed-slack": "slack",
    "managed-notion": "notion",
    "managed-google_drive": "google_drive",
    "managed-github": "github",
    "managed-confluence": "confluence",
  };

  for (const [key, value] of Object.entries(providerMap)) {
    if (document.dataSourceId.startsWith(key)) {
      return value;
    }
  }

  return "none";
}

export function titleFromDocument(document: RetrievalDocumentType): string {
  const provider = providerFromDocument(document);

  if (provider === "slack") {
    for (const t of document.tags) {
      if (t.startsWith("channelName:")) {
        return `#${t.substring(12)}`;
      }
    }
  }

  for (const t of document.tags) {
    if (t.startsWith("title:")) {
      return t.substring(6);
    }
  }

  if (provider === "none") {
    return `[${document.dataSourceId}] ${document.documentId}`;
  }

  return document.documentId;
}

export function linkFromDocument(document: RetrievalDocumentType): string {
  if (document.sourceUrl) {
    return document.sourceUrl;
  } else {
    return `https://dust.tt/w/${
      document.dataSourceWorkspaceId
    }/builder/data-sources/${
      document.dataSourceId
    }/upsert?documentId=${encodeURIComponent(document.documentId)}`;
  }
}
