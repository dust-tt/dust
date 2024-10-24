import type { Citation } from "@dust-tt/sparkle";
import type { RetrievalDocumentType } from "@dust-tt/types";
import {
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
} from "@dust-tt/types";

export interface RetrievedDocumentCitation {
  href?: string;
  title: string;
  type: Exclude<React.ComponentProps<typeof Citation>["type"], undefined>;
}

export function makeDocumentCitation(document: RetrievalDocumentType) {
  return {
    href: document.sourceUrl ?? undefined,
    title: getTitleFromRetrievedDocument(document),
    type: getProviderFromRetrievedDocument(document),
  };
}

export function makeDocumentCitations(
  documents: RetrievalDocumentType[]
): RetrievedDocumentCitation[] {
  return documents.map(makeDocumentCitation);
}
