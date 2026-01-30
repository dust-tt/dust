import type { ModelId } from "@connectors/types";

export function makeConfluenceSpaceSyncWorkflowIdFromParentId(
  parentWorkflowId: string,
  spaceId: string
) {
  return `${parentWorkflowId}-space-${spaceId}`;
}

export function makeConfluenceSyncTopLevelChildContentWorkflowIdFromParentId({
  parentWorkflowId,
  topLevelContentId,
}: {
  parentWorkflowId: string;
  topLevelContentId: string;
}) {
  return `${parentWorkflowId}-top-level-content-${topLevelContentId}`;
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
  return "confluence-personal-data-reporting";
}
