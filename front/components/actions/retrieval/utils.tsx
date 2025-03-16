import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { citationIconMap } from "@app/components/markdown/MarkdownCitation";
import type { RetrievalDocumentType } from "@app/lib/actions/retrieval";
import type { ConnectorProvider } from "@app/types";

type ConnectorProviderDocumentType =
  | Exclude<ConnectorProvider, "webcrawler">
  | "document";

export function getProviderFromRetrievedDocument(
  document: RetrievalDocumentType
): ConnectorProviderDocumentType {
  if (document.dataSourceView) {
    if (document.dataSourceView.dataSource.connectorProvider === "webcrawler") {
      return "document";
    }
    return document.dataSourceView.dataSource.connectorProvider || "document";
  }
  return "document";
}

export function getTitleFromRetrievedDocument(
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

  return document.documentId;
}

export function makeDocumentCitation(
  document: RetrievalDocumentType
): MarkdownCitation {
  const IconComponent =
    citationIconMap[getProviderFromRetrievedDocument(document)];
  return {
    href: document.sourceUrl ?? undefined,
    title: getTitleFromRetrievedDocument(document),
    icon: <IconComponent />,
  };
}

export function makeDocumentCitations(
  documents: RetrievalDocumentType[]
): MarkdownCitation[] {
  return documents.map(makeDocumentCitation);
}
