import {
  Chip,
  DocumentDuplicateStrokeIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";

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
  function shortText(text: string, maxLength = 20) {
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }
  return (
    <div>
      <div className="text-xs font-bold text-element-600">
        Searching for:
        <div className="ml-2 inline-block">
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
              <Chip
                color="slate"
                label={query ? shortText(query) : "No query"}
              />
            </Tooltip>
          </Chip.List>
        </div>
      </div>
      {!retrievalAction.documents ? (
        <div>
          <div className="my-2 text-xs font-bold text-element-600">
            Retrieving...
          </div>
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="mt-2 text-xs font-bold text-element-600">
          Retrieved:
          <Chip color="violet" className="ml-2">
            {retrievalAction.documents.length > 0
              ? RetrievedDocumentsInfo(retrievalAction.documents)
              : "No documents found"}
          </Chip>
        </div>
      )}
    </div>
  );
}

function RetrievedDocumentsInfo(documents: RetrievalDocumentType[]) {
  const summary = documentsSummary(documents);
  return (
    <>
      <span>{documents.length} results</span>
      {Object.keys(summary).map((k) => {
        return (
          <div key={k} className="ml-3 flex flex-initial flex-row items-center">
            <div className={classNames("mr-1 flex h-4 w-4")}>
              {summary[k].provider !== "none" ? (
                <img src={PROVIDER_LOGO_PATH[summary[k].provider]}></img>
              ) : (
                <DocumentDuplicateStrokeIcon className="h-4 w-4 text-slate-500" />
              )}
            </div>
            <div className="flex-initial text-gray-700">{summary[k].count}</div>
          </div>
        );
      })}
    </>
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
