import mainLogger from "@connectors/logger/logger";
import {
  PostUpsertHook,
  PostUpsertHookFilter,
  PostUpsertHookWorkflowLauncher,
} from "@connectors/post_upsert_hooks";

import { shouldRunDocumentTracker } from "./lib/front_api";
import { launchDocumentTrackerHandleUpsertWorkflow } from "./temporal/client";

const logger = mainLogger.child({
  postUpsertHook: "document_tracker",
});

const documentTrackerPostUpsertHookWorfklowLauncher: PostUpsertHookWorkflowLauncher =
  async (dataSourceConfig, documentId) => {
    const localLogger = logger.child({
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
      documentId,
    });

    localLogger.info("Launching document tracker post upsert hook workflow.");

    await launchDocumentTrackerHandleUpsertWorkflow(
      dataSourceConfig,
      documentId
    );
  };

const documentTrackerPostUpsertHookFilter: PostUpsertHookFilter = async (
  dataSourceConfig,
  documentId
) => {
  const localLogger = logger.child({
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceName: dataSourceConfig.dataSourceName,
    documentId,
  });

  localLogger.info("Checking if document tracker post upsert hook should run.");

  const shouldRun = await shouldRunDocumentTracker(
    dataSourceConfig,
    documentId
  );

  localLogger.info(
    {
      shouldRun,
    },
    "Checked if document tracker post upsert hook should run."
  );

  return shouldRun;
};

export const documentTrackerPostUpsertHook: PostUpsertHook = {
  filter: documentTrackerPostUpsertHookFilter,
  workflowLauncher: documentTrackerPostUpsertHookWorfklowLauncher,
};
