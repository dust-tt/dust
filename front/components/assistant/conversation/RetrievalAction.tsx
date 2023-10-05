import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  DocumentTextIcon,
  Icon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import { useState } from "react";

import { classNames } from "@app/lib/utils";
import {
  RetrievalActionType,
  RetrievalDocumentType,
} from "@app/types/assistant/actions/retrieval";

export const PROVIDER_LOGO_PATH: { [provider: string]: string } = {
  notion: "/static/notion_32x32.png",
  slack: "/static/slack_32x32.png",
  google_drive: "/static/google_drive_32x32.png",
  github: "/static/github_black_32x32.png",
};

export default function RetrievalAction({
  retrievalAction,
}: {
  retrievalAction: RetrievalActionType;
}) {
  const { query, relativeTimeFrame } = retrievalAction.params;
  const [docListVisible, setDocListVisible] = useState(false);

  function shortText(text: string, maxLength = 20) {
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  return (
    <>
      <div className="flex flex-row items-center gap-2 pb-2">
        <div className="text-xs font-bold text-element-600">Searching for:</div>
        <Chip.List>
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
          <Tooltip label={`Query used for semantic search: ${query}`}>
            <Chip color="slate" label={query ? shortText(query) : "No query"} />
          </Tooltip>
        </Chip.List>
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div className="grid-cols-auto grid items-center">
          {!retrievalAction.documents ? (
            <div>
              <div className="text-xs font-bold text-element-600">
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
              <Chip color="violet">
                {retrievalAction.documents.length > 0
                  ? RetrievedDocumentsInfo(retrievalAction.documents)
                  : "No documents found"}
                <Icon
                  visual={docListVisible ? ChevronDownIcon : ChevronRightIcon}
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
                          <img
                            src={
                              PROVIDER_LOGO_PATH[providerFromDocument(document)]
                            }
                            className="mr-1 inline-block h-4 w-4"
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
      <span className="hidden lg:block">{documents.length} results</span>
      {Object.keys(summary).map((k) => {
        return (
          <div key={k} className="ml-3 flex flex-initial flex-row items-center">
            <div className={classNames("mr-1 flex h-4 w-4")}>
              {summary[k].provider !== "none" ? (
                <img src={PROVIDER_LOGO_PATH[summary[k].provider]}></img>
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
  [key: string]: { count: number; provider: string };
} {
  const summary = {} as {
    [key: string]: { count: number; provider: string };
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

export function providerFromDocument(document: RetrievalDocumentType): string {
  let provider = "none";
  if (document.dataSourceId.startsWith("managed-slack")) {
    provider = "slack";
  }
  if (document.dataSourceId.startsWith("managed-notion")) {
    provider = "notion";
  }
  if (document.dataSourceId.startsWith("managed-google_drive")) {
    provider = "google_drive";
  }
  if (document.dataSourceId.startsWith("managed-github")) {
    provider = "github";
  }
  return provider;
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
