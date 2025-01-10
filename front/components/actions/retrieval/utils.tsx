import type { RetrievalDocumentType } from "@dust-tt/types";
import {
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
} from "@dust-tt/types";

import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { citationIconMap } from "@app/components/markdown/MarkdownCitation";

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
