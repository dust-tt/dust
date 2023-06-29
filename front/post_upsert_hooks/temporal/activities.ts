import { CoreAPI } from "@app/lib/core_api";
import { DataSource, Workspace } from "@app/lib/models";
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

  const docText = await getDocText(dataSourceName, workspaceId, documentId);

  // TODO: parallel
  for (const hook of POST_UPSERT_HOOKS) {
    if (await hook.filter(dataSourceName, workspaceId, documentId, docText)) {
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
  const docText = await getDocText(dataSourceName, workspaceId, documentId);
  await hook.fn(dataSourceName, workspaceId, documentId, docText);
  localLogger.info("Ran post upsert hook function.");
}

async function getDocText(
  dataSourceName: string,
  workspaceId: string,
  documentId: string
): Promise<string> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Could not find workspace ${workspaceId}`);
  }

  const dataSource = await DataSource.findOne({
    where: {
      name: dataSourceName,
      workspaceId: workspace.id,
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
  return docText.value.document.text || "";
}
