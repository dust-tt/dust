import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { citationIconMap } from "@app/components/markdown/MarkdownCitation";
import type { RetrievalDocumentType } from "@app/types";
import {
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
} from "@app/types";

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
