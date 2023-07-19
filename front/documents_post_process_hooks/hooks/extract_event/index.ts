import {
  DocumentsPostProcessHook,
  DocumentsPostProcessHookFilterParams,
  DocumentsPostProcessHookOnUpsertParams,
} from "@app/documents_post_process_hooks/hooks";
import {
  processExtractEvents,
  shouldProcessExtractEvents,
} from "@app/lib/extract_events";
import mainLogger from "@app/logger/logger";

const logger = mainLogger.child({
  postUpsertHook: "extract_event",
});

export const extractEventPostProcessHook: DocumentsPostProcessHook = {
  type: "extract_event",
  filter: shouldProcessDocument,
  onUpsert: processDocument,
};

async function shouldProcessDocument(
  params: DocumentsPostProcessHookFilterParams
) {
  return await shouldProcessExtractEvents(params);
}

async function processDocument(params: DocumentsPostProcessHookOnUpsertParams) {
  const localLogger = logger.child({
    workspaceId: params.workspaceId,
    dataSourceName: params.dataSourceName,
    documentId: params.documentId,
  });
  localLogger.info("[Extract event] Processing doc.");
  await processExtractEvents(params);
}
