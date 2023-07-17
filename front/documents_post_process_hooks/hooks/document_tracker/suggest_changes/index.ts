import { DocumentsPostProcessHook } from "@app/documents_post_process_hooks/hooks";
import {
  documentTrackerSuggestChangesOnUpsert,
  shouldDocumentTrackerSuggestChangesRun,
} from "@app/documents_post_process_hooks/hooks/document_tracker/suggest_changes/lib";

// this hook is meant to suggest changes to tracked documents
// based on new information that has been added to other documents
// it should run on upserts if the workspace has tracked docs
export const documentTrackerSuggestChangesPostProcessHook: DocumentsPostProcessHook =
  {
    type: "document_tracker_suggest_changes",
    getDebounceMs: async ({ dataSourceConnectorProvider }) => {
      if (!dataSourceConnectorProvider) {
        return 10000; // 10 seconds
      }
      if (dataSourceConnectorProvider === "notion") {
        return 600000; // 10 minutes
      }
      return 3600000; // 1 hour
    },
    filter: shouldDocumentTrackerSuggestChangesRun,
    onUpsert: documentTrackerSuggestChangesOnUpsert,
  };
