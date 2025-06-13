import { DocumentIcon } from "@dust-tt/sparkle";

import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { getCitationIcon } from "@app/components/markdown/MarkdownCitation";
import type { RetrievalDocumentType } from "@app/lib/actions/retrieval";
import {
  getProviderFromRetrievedDocument,
  getTitleFromRetrievedDocument,
} from "@app/lib/api/assistant/citations";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { isConnectorProvider } from "@app/types";

export function makeDocumentCitation(
  document: RetrievalDocumentType,
  isDark?: boolean
): MarkdownCitation {
  const IconComponent = getCitationIcon(
    getProviderFromRetrievedDocument(document),
    isDark
  );
  return {
    href: document.sourceUrl ?? undefined,
    title: getTitleFromRetrievedDocument(document),
    icon: <IconComponent />,
  };
}

export function makeDocumentCitations(
  documents: RetrievalDocumentType[],
  isDark?: boolean
): MarkdownCitation[] {
  return documents.map((document) => makeDocumentCitation(document, isDark));
}

export function getDocumentIcon(provider: string | null | undefined) {
  if (provider && isConnectorProvider(provider)) {
    const IconComponent = getConnectorProviderLogoWithFallback({
      provider,
      fallback: DocumentIcon,
    });
    return IconComponent;
  }
  return DocumentIcon;
}
