import type { Citation } from "@dust-tt/sparkle";
import type { RetrievalDocumentType } from "@dust-tt/types";
import {
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
} from "@dust-tt/types";

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
  type: Exclude<React.ComponentProps<typeof Citation>["type"], undefined>;
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
