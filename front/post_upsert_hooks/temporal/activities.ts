import { ConnectorProvider } from "@app/lib/connectors_api";
import { CoreAPI } from "@app/lib/core_api";
import { DataSource, Workspace } from "@app/lib/models";
import logger from "@app/logger/logger";
import {
  POST_UPSERT_HOOK_BY_TYPE,
  PostUpsertHookType,
} from "@app/post_upsert_hooks/hooks";

// TODO: delete
// We need to keep until all pending workflows are finished
export async function runPostUpsertHookActivity(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: PostUpsertHookType
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceName,
    documentId,
    dataSourceConnectorProvider,
    hookType,
  });

  const hook = POST_UPSERT_HOOK_BY_TYPE[hookType];
  if (!hook) {
    localLogger.error("Unknown post upsert hook type");
    throw new Error(`Unknown post upsert hook type ${hookType}`);
  }

  localLogger.info("Running post upsert hook function.");
  const documentText = await getDocText(
    dataSourceName,
    workspaceId,
    documentId
  );
  await hook.fn({
    dataSourceName,
    workspaceId,
    documentId,
    documentText,
    documentHash: "No Hash",
    dataSourceConnectorProvider,
  });
  localLogger.info("Ran post upsert hook function.");
}

export async function runPostUpsertHookActivityV2(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: PostUpsertHookType
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceName,
    documentId,
    dataSourceConnectorProvider,
    hookType,
  });

  const hook = POST_UPSERT_HOOK_BY_TYPE[hookType];
  if (!hook) {
    localLogger.error("Unknown post upsert hook type");
    throw new Error(`Unknown post upsert hook type ${hookType}`);
  }

  localLogger.info("Running post upsert hook function.");
  const documentText = await getDocText(
    dataSourceName,
    workspaceId,
    documentId
  );
  await hook.fn({
    dataSourceName,
    workspaceId,
    documentId,
    documentText,
    documentHash,
    dataSourceConnectorProvider,
  });
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
