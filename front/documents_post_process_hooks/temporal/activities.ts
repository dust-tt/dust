import { ConnectorProvider } from "@dust-tt/types";

import {
  DOCUMENTS_POST_PROCESS_HOOK_BY_TYPE,
  DocumentsPostProcessHookType,
} from "@app/documents_post_process_hooks/hooks";
import { Authenticator } from "@app/lib/auth";
import { CoreAPI, CoreAPIDataSource, CoreAPIDocument } from "@app/lib/core_api";
import { DataSource, Workspace } from "@app/lib/models";
import logger from "@app/logger/logger";

export async function runPostUpsertHookActivity(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceName,
    documentId,
    dataSourceConnectorProvider,
    hookType,
  });

  const hook = DOCUMENTS_POST_PROCESS_HOOK_BY_TYPE[hookType];
  if (!hook) {
    localLogger.error("Unknown documents post process hook type");
    throw new Error(`Unknown documents post process hook type ${hookType}`);
  }

  localLogger.info("Running documents post process hook onUpsert function.");

  const dataSourceDocument = await getDataSourceDocument(
    dataSourceName,
    workspaceId,
    documentId
  );
  const documentText = dataSourceDocument.document.text || "";
  const documentSourceUrl = dataSourceDocument.document.source_url || undefined;

  if (!hook.onUpsert) {
    localLogger.warn("No onUpsert function for documents post process hook");
    return;
  }

  await hook.onUpsert({
    dataSourceName,
    auth: await Authenticator.internalBuilderForWorkspace(workspaceId),
    documentId,
    documentText,
    documentSourceUrl,
    documentHash,
    dataSourceConnectorProvider,
  });
  localLogger.info("Ran documents post process hook onUpsert function.");
}

export async function runPostDeleteHookActivity(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceName,
    documentId,
    dataSourceConnectorProvider,
    hookType,
  });

  const hook = DOCUMENTS_POST_PROCESS_HOOK_BY_TYPE[hookType];
  if (!hook) {
    localLogger.error("Unknown documents post process hook type");
    throw new Error(`Unknown documents post process hook type ${hookType}`);
  }

  localLogger.info("Running documents post process hook onDelete function.");

  if (!hook.onDelete) {
    localLogger.warn("No onDelete function for documents post process hook");
    return;
  }

  await hook.onDelete({
    dataSourceName,
    auth: await Authenticator.internalBuilderForWorkspace(workspaceId),
    documentId,
    dataSourceConnectorProvider,
  });
  localLogger.info("Ran documents post process hook ondelete function.");
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
