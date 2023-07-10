import { hasExtractEventMarker } from "@app/lib/extract_event_markers";
import { processExtractEvents } from "@app/lib/extract_events";
import mainLogger from "@app/logger/logger";
import {
  PostUpsertHook,
  PostUpsertHookParams,
} from "@app/post_upsert_hooks/hooks";

const logger = mainLogger.child({
  postUpsertHook: "extract_event",
});

export const extractEventPostUpsertHook: PostUpsertHook = {
  type: "extract_event",
  filter: shouldProcessDocument,
  fn: processDocument,
};

async function shouldProcessDocument({
  dataSourceName,
  workspaceId,
  documentId,
  documentText,
}: PostUpsertHookParams) {
  const localLogger = logger.child({ workspaceId, dataSourceName, documentId });
  const hasMarker = hasExtractEventMarker(documentText);
  localLogger.info(
    `[Extract event] Doc contains marker: ${hasMarker ? "yes" : "no"}`
  );
  return hasMarker;
}

async function processDocument({
  dataSourceName,
  workspaceId,
  documentId,
  documentText,
}: PostUpsertHookParams) {
  const localLogger = logger.child({ workspaceId, dataSourceName, documentId });
  localLogger.info("[Extract event] Processing doc.");
  await processExtractEvents({
    workspaceId,
    dataSourceName,
    documentId,
    documentText,
  });
}
