import { CoreAPI } from "@app/lib/core_api";
import { DataSource } from "@app/lib/models";
import logger from "@app/logger/logger";
import {
  POST_UPSERT_HOOK_BY_TYPE,
  POST_UPSERT_HOOKS,
  PostUpsertHookType,
} from "@app/post_upsert_hooks/hooks";

export async function getPostUpsertHooksToRunActivity(
  dataSourceName: string,
  workspaceId: string,
  documentId: string
): Promise<PostUpsertHookType[]> {
  const hooksToRun: PostUpsertHookType[] = [];
  const dataSource = await DataSource.findOne({
    where: {
      name: dataSourceName,
      workspaceId,
    },
  });
  if (!dataSource) {
    throw new Error(`Could not find data source ${dataSourceName}`);
  }
  const docText = await CoreAPI.getDataSourceDocument(
    dataSource?.dustAPIProjectId,
    dataSourceName,
    documentId
  );
  if (docText.isErr()) {
    throw new Error(`Could not get document text for ${documentId}`);
  }
  const docTextStr = docText.value.document.text;

  // TODO: parallel
  for (const hook of POST_UPSERT_HOOKS) {
    if (
      await hook.filter(
        dataSourceName,
        workspaceId,
        documentId,
        docTextStr || ""
      )
    ) {
      hooksToRun.push(hook.type);
    }
  }

  return hooksToRun;
}

export async function runPostUpsertHookActivity(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  hookType: PostUpsertHookType
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceName,
    documentId,
    hookType,
  });

  const hook = POST_UPSERT_HOOK_BY_TYPE[hookType];
  if (!hook) {
    localLogger.error("Unknown post upsert hook type");
    throw new Error(`Unknown post upsert hook type ${hookType}`);
  }

  localLogger.info("Running post upsert hook function.");
  await hook.fn(dataSourceName, workspaceId, documentId);
  localLogger.info("Ran post upsert hook function.");
}
