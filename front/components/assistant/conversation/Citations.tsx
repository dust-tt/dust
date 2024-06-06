import { Citation } from "@dust-tt/sparkle";
import type { RetrievalDocumentType } from "@dust-tt/types";

import { makeLinkForRetrievedDocument } from "@app/components/actions/retrieval/utils";
import {
  providerFromDocument,
  titleFromDocument,
} from "@app/components/assistant/conversation/RetrievalAction";

export function Citations({
  activeReferences,
  lastHoveredReference,
}: {
  activeReferences: { index: number; document: RetrievalDocumentType }[];
  lastHoveredReference: number | null;
}) {
  activeReferences.sort((a, b) => a.index - b.index);
  return (
    <div className="grid grid-cols-3 items-stretch gap-2 pb-4 pt-8 md:grid-cols-4">
      {activeReferences.map(({ document, index }) => {
        const provider = providerFromDocument(document);
        return (
          <Citation
            key={index}
            size="xs"
            sizing="fluid"
            isBlinking={lastHoveredReference === index}
            type={provider === "none" ? "document" : provider}
            title={titleFromDocument(document)}
            href={makeLinkForRetrievedDocument(document)}
            index={index}
          />
        );
      })}
    </div>
  );
}
