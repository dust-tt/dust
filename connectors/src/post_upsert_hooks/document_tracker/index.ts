import mainLogger from "@connectors/logger/logger";
import { PostUpsertHook } from "@connectors/post_upsert_hooks";

import { shouldRunDocumentTracker } from "./lib/front_api";
import { launchDocumentTrackerHandleUpsertWorkflow } from "./temporal/client";

const logger = mainLogger.child({
  postUpsertHook: "document_tracker",
});

export const documentTrackerPostUpsertHook: PostUpsertHook = async (
  dataSourceConfig,
  documentId
) => {
  const localLogger = logger.child({
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceName: dataSourceConfig.dataSourceName,
    documentId,
  });
  if (!(await shouldRunDocumentTracker(dataSourceConfig, documentId))) {
    localLogger.info("Not running document tracker post upsert hook.");
    return;
  }

  localLogger.info("Running document tracker post upsert hook.");

  await launchDocumentTrackerHandleUpsertWorkflow(dataSourceConfig, documentId);
};
