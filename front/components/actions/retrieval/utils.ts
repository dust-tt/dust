import type { CitationType } from "@dust-tt/sparkle/dist/cjs/components/Citation";
import type { ConnectorProvider, RetrievalDocumentType } from "@dust-tt/types";

type ConnectorProviderDocumentType =
  | Exclude<ConnectorProvider, "webcrawler">
  | "document";

const providerMap: Record<string, ConnectorProviderDocumentType> = {
  "managed-slack": "slack",
  "managed-notion": "notion",
  "managed-google_drive": "google_drive",
  "managed-github": "github",
  "managed-confluence": "confluence",
  "managed-intercom": "intercom",
};

const providerRegex = new RegExp(`^(${Object.keys(providerMap).join("|")})`);

function getProviderFromRetrievedDocument(
  document: RetrievalDocumentType
): ConnectorProviderDocumentType {
  const match = document.dataSourceId.match(providerRegex);
  if (match && match[1]) {
    return providerMap[match[1]];
  }

  return "document";
}

function getTitleFromRetrievedDocument(
  document: RetrievalDocumentType
): string {
  const provider = getProviderFromRetrievedDocument(document);

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

  if (provider === "document") {
    return `[${document.dataSourceId}] ${document.documentId}`;
  }

  return document.documentId;
}

export function makeLinkForRetrievedDocument(
  document: RetrievalDocumentType
): string {
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

interface RetrievedDocumentCitation {
  href: string;
  title: string;
  type: CitationType;
}

export function makeDocumentCitations(
  documents: RetrievalDocumentType[]
): RetrievedDocumentCitation[] {
  return documents.reduce((acc, doc) => {
    acc.push({
      href: makeLinkForRetrievedDocument(doc),
      title: getTitleFromRetrievedDocument(doc),
      type: getProviderFromRetrievedDocument(doc),
    });

    return acc;
  }, [] as RetrievedDocumentCitation[]);
}
