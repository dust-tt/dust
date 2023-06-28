import mainLogger from "@app/logger/logger";
import { PostUpsertHook } from "@app/post_upsert_hooks/hooks";

const logger = mainLogger.child({
  postUpsertHook: "document_tracker",
});

export const documentTrackerPostUpsertHook: PostUpsertHook = {
  type: "document_tracker",
  filter: async (dataSourceName, workspaceId, documentId, documentText) => {
    const localLogger = logger.child({
      workspaceId,
      dataSourceName,
      documentId,
    });
    localLogger.info(
      "Checking if document tracker post upsert hook should run."
    );

    if (documentText.includes("DUST_TRACK(")) {
      localLogger.info(
        "Document includes DUST_TRACK tags, document_tracker post upsert hook should run."
      );
      return true;
    }

    // TODO: check tracked docs in WS
    return false;
  },
  fn: async (dataSourceName, workspaceId, documentId) => {
    void dataSourceName;
    void workspaceId;
    void documentId;
    // TODO: do the thing
  },
};
