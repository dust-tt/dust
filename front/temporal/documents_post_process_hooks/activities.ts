import type {
  ConnectorProvider,
  CoreAPIDataSource,
  CoreAPIDocument,
  Result,
} from "@dust-tt/types";
import { CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { DocumentsPostProcessHookType } from "@app/lib/documents_post_process_hooks/hooks";
import { DOCUMENTS_POST_PROCESS_HOOK_BY_TYPE } from "@app/lib/documents_post_process_hooks/hooks";
import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { withRetries } from "@app/lib/utils/retries";
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

  const dataSourceDocumentRes = await withRetries(getDataSourceDocument)({
    dataSourceName,
    workspaceId,
    documentId,
  });

  if (dataSourceDocumentRes.isErr()) {
    localLogger.warn(
      {
        error: dataSourceDocumentRes.error,
      },
      "Document has been deleted or is unreachable. Skipping post process hook."
    );
    return;
  }

  const dataSourceDocument = dataSourceDocumentRes.value;

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

async function getDataSourceDocument({
  dataSourceName,
  workspaceId,
  documentId,
}: {
  dataSourceName: string;
  workspaceId: string;
  documentId: string;
}): Promise<
  Result<{ document: CoreAPIDocument; data_source: CoreAPIDataSource }, Error>
> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    return new Err(new Error(`Could not find workspace ${workspaceId}`));
  }

  const dataSource = await DataSource.findOne({
    where: {
      name: dataSourceName,
      workspaceId: workspace.id,
    },
  });
  if (!dataSource) {
    return new Err(new Error(`Could not find data source ${dataSourceName}`));
  }
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const docText = await coreAPI.getDataSourceDocument({
    projectId: dataSource?.dustAPIProjectId,
    dataSourceName: dataSourceName,
    documentId,
  });
  if (docText.isErr()) {
    return new Err(new Error(`Could not get document text for ${documentId}`));
  }
  return new Ok(docText.value);
}
