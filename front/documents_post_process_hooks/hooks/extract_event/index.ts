import {
  PostUpsertHook,
  PostUpsertHookParams,
} from "@app/documents_post_process_hooks/hooks";
import { hasExtractEventMarker } from "@app/lib/extract_event_markers";
import {
  processExtractEvents,
  shouldProcessExtractEvents,
} from "@app/lib/extract_events";
import mainLogger from "@app/logger/logger";

const logger = mainLogger.child({
  postUpsertHook: "extract_event",
});

export const extractEventPostUpsertHook: PostUpsertHook = {
  type: "extract_event",
  filter: shouldProcessDocument,
  fn: processDocument,
};

async function shouldProcessDocument(params: PostUpsertHookParams) {
  return await shouldProcessExtractEvents(params);
}

async function processDocument(params: PostUpsertHookParams) {
  const localLogger = logger.child({
    workspaceId: params.workspaceId,
    dataSourceName: params.dataSourceName,
    documentId: params.documentId,
  });
  localLogger.info("[Extract event] Processing doc.");
  await processExtractEvents(params);
}
