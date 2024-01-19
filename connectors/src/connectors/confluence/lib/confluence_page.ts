import type { ModelId } from "@dust-tt/types";

import { ConfluencePage } from "@connectors/lib/models/confluence";

export async function isConfluencePageSkipped(
  connectorId: ModelId,
  pageId: string
) {
  const page = await ConfluencePage.findOne({
    attributes: ["skipReason"],
    where: {
      connectorId,
      pageId,
    },
  });

  return page && page.skipReason !== null;
}
