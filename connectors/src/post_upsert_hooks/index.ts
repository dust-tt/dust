import logger from "@connectors/logger/logger";
import { documentTrackerPostUpsertHook } from "@connectors/post_upsert_hooks/document_tracker";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const { SHOULD_RUN_POST_UPSERT_HOOKS = false } = process.env;

export type PostUpsertHookWorkflowLauncher = (
  dataSourceConfig: DataSourceConfig,
  documentId: string
) => Promise<void>;

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
