import { processExtractEvents } from "@app/lib/extract_events";
import { hasExtractEventMarker } from "@app/lib/extract_event_markers";
import mainLogger from "@app/logger/logger";
import { PostUpsertHook } from "@app/post_upsert_hooks/hooks";

const logger = mainLogger.child({
  postUpsertHook: "extract_event",
});

export const extractEventPostUpsertHook: PostUpsertHook = {
  type: "extract_event",
  filter: shouldProcessDocument,
  fn: processDocument,
};

async function shouldProcessDocument(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentText: string
) {
  const localLogger = logger.child({ workspaceId, dataSourceName, documentId });
  const hasMarker = hasExtractEventMarker(documentText);
  localLogger.info(
    `[Extract event] Doc contains marker: ${hasMarker ? "yes" : "no"}`
  );
  return hasMarker;
}

async function processDocument(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentText: string
) {
  const localLogger = logger.child({ workspaceId, dataSourceName, documentId });
  localLogger.info("[Extract event] Processing doc.");
  await processExtractEvents({
    workspaceId,
    dataSourceName,
    documentId,
    documentText,
  });
}
