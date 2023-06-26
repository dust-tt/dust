import logger from "@connectors/logger/logger";
import { documentTrackerPostUpsertHook } from "@connectors/post_upsert_hooks/document_tracker";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const { SHOULD_RUN_POST_UPSERT_HOOKS = false } = process.env;

// Should launch a temporal worfklow to actually perform the post upsert hook (with retries)
// Should be relatively quick to run
// Launching the workflow will not be retried (but activities within the workflow are retried)
export type PostUpsertHookWorkflowLauncher = (
  dataSourceConfig: DataSourceConfig,
  documentId: string
) => Promise<void>;

// Should return true if the post upsert hook should run for this document
// Should return false if the post upsert hook should not run for this document
// Should be relatively quick to run
// Will not be retried
export type PostUpsertHookFilter = (
  dataSourceConfig: DataSourceConfig,
  documentId: string
) => Promise<boolean>;

export type PostUpsertHook = {
  filter: PostUpsertHookFilter;
  workflowLauncher: PostUpsertHookWorkflowLauncher;
};

const POST_UPSERT_HOOKS: PostUpsertHook[] = [documentTrackerPostUpsertHook];

export async function runPostUpsertHooks(
  dataSourceConfig: DataSourceConfig,
  documentId: string
) {
  if (!SHOULD_RUN_POST_UPSERT_HOOKS) {
    logger.info(
      {
        dataSourceName: dataSourceConfig.dataSourceName,
        workspaceId: dataSourceConfig.workspaceId,
        documentId,
      },
      "Skipping post upsert hooks (SHOULD_RUN_POST_UPSERT_HOOKS is false)"
    );
    return;
  }

  const runHook = async (hook: PostUpsertHook) => {
    const shouldRun = await hook.filter(dataSourceConfig, documentId);
    if (shouldRun) {
      await hook.workflowLauncher(dataSourceConfig, documentId);
    }
  };

  // TODO: figure out max concurrency ?
  // TODO: figure out if we want to retry this ?
  try {
    await Promise.all(POST_UPSERT_HOOKS.map(runHook));
  } catch (e) {
    logger.error(
      {
        dataSourceName: dataSourceConfig.dataSourceName,
        workspaceId: dataSourceConfig.workspaceId,
        documentId,
        err: e,
      },
      "Error running post upsert hooks"
    );
  }
}
