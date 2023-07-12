import { ConnectorProvider } from "@app/lib/connectors_api";
import { CoreAPI, CoreAPIDataSource, CoreAPIDocument } from "@app/lib/core_api";
import { DataSource, Workspace } from "@app/lib/models";
import logger from "@app/logger/logger";
import {
  POST_UPSERT_HOOK_BY_TYPE,
  PostUpsertHookType,
} from "@app/post_upsert_hooks/hooks";

export async function runPostUpsertHookActivity(
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

  const dataSourceDocument = await getDataSourceDocument(
    dataSourceName,
    workspaceId,
    documentId
  );
  const documentText = dataSourceDocument.document.text || "";
  const documentSourceUrl = dataSourceDocument.document.source_url || undefined;

  await hook.fn({
    dataSourceName,
    workspaceId,
    documentId,
    documentText,
    documentSourceUrl,
    documentHash,
    dataSourceConnectorProvider,
  });
  localLogger.info("Ran post upsert hook function.");
}

async function getDataSourceDocument(
  dataSourceName: string,
  workspaceId: string,
  documentId: string
): Promise<{ document: CoreAPIDocument; data_source: CoreAPIDataSource }> {
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
  const docText = await CoreAPI.getDataSourceDocument({
    projectId: dataSource?.dustAPIProjectId,
    dataSourceName: dataSourceName,
    documentId,
  });
  if (docText.isErr()) {
    throw new Error(`Could not get document text for ${documentId}`);
  }
  return docText.value;
}
