import type { ModelId } from "@connectors/types";

export function makeConfluenceSpaceSyncWorkflowIdFromParentId(
  parentWorkflowId: string,
  spaceId: string
) {
  return `${parentWorkflowId}-space-${spaceId}`;
}

export function makeConfluenceSyncTopLevelChildPagesWorkflowIdFromParentId(
  parentWorkflowId: string,
  topLevelPageId: string
) {
  return `${parentWorkflowId}-top-level-page-${topLevelPageId}`;
}

export function makeConfluenceRemoveSpacesWorkflowId(connectorId: ModelId) {
  return `confluence-remove-${connectorId}`;
}

export function makeConfluenceRemoveSpaceWorkflowIdFromParentId(
  parentWorkflowId: string,
  spaceId: string
) {
  return `${parentWorkflowId}-space-${spaceId}`;
}

export function makeConfluencePersonalDataWorkflowId() {
  return `confluence-personal-data-reporting`;
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
