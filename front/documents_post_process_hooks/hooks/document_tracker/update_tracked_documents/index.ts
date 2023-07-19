import { DocumentsPostProcessHook } from "@app/documents_post_process_hooks/hooks";
import {
  documentTrackerUpdateTrackedDocumentsOnDelete,
  documentTrackerUpdateTrackedDocumentsOnUpsert,
  shouldDocumentTrackerUpdateTrackedDocumentsRun,
} from "@app/documents_post_process_hooks/hooks/document_tracker/update_tracked_documents/lib";

// This hook is meant to update the TrackedDocuments table based on
// DUST_TRACK tags seen in documents. It should run on upserts, and on deletes (to cleanup)
export const documentTrackerUpdateTrackedDocumentsPostProcessHook: DocumentsPostProcessHook =
  {
    type: "document_tracker_update_tracked_documents",
    getDebounceMs: async () => 1000,
    filter: shouldDocumentTrackerUpdateTrackedDocumentsRun,
    onUpsert: documentTrackerUpdateTrackedDocumentsOnUpsert,
    onDelete: documentTrackerUpdateTrackedDocumentsOnDelete,
  };
