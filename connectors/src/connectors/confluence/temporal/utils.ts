import type { ModelId } from "@dust-tt/types";

export function makeConfluenceFullSyncWorkflowId(connectorId: ModelId) {
  return `confluence-fullsync-${connectorId}`;
}

export function makeConfluenceSpaceSyncWorkflowIdFromParentId(
  parentWorkflowId: string,
  spaceId: string
) {
  return `${parentWorkflowId}-space-${spaceId}`;
}

export function makeConfluencePageId(pageId: string) {
  // Omit space reference in the ID to accommodate Confluence pages moving between spaces.
  return `confluence-page-${pageId}`;
}

export function makeConfluenceDocumentUrl({
  baseUrl,
  suffix,
}: {
  baseUrl: string;
  suffix: string;
}) {
  return `${baseUrl}/wiki${suffix}`;
}
