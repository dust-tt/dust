import type { RetrievalDocumentType } from "@dust-tt/types";
import {
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
} from "@dust-tt/types";

export function makeDocumentCitation(document: RetrievalDocumentType) {
  return {
    href: document.sourceUrl ?? undefined,
    title: getTitleFromRetrievedDocument(document),
    type: getProviderFromRetrievedDocument(document),
  };
}

export function makeDocumentCitations(documents: RetrievalDocumentType[]) {
  return documents.map(makeDocumentCitation);
}
