import type { Citation } from "@dust-tt/sparkle";
import type { RetrievalDocumentType } from "@dust-tt/types";
import {
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
} from "@dust-tt/types";

interface RetrievedDocumentCitation {
  href: string | undefined;
  title: string;
  type: Exclude<React.ComponentProps<typeof Citation>["type"], undefined>;
}

export function makeDocumentCitations(
  documents: RetrievalDocumentType[]
): RetrievedDocumentCitation[] {
  return documents.reduce((acc, doc) => {
    acc.push({
      href: doc.sourceUrl ?? undefined,
      title: getTitleFromRetrievedDocument(doc),
      type: getProviderFromRetrievedDocument(doc),
    });

    return acc;
  }, [] as RetrievedDocumentCitation[]);
}
