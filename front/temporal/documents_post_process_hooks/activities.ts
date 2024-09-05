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
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { withRetries } from "@app/lib/utils/retries";
import logger from "@app/logger/logger";

export async function runPostUpsertHookActivity(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceId,
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
    workspaceId,
    dataSourceId,
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
    auth: await Authenticator.internalBuilderForWorkspace(workspaceId),
    dataSourceId,
    documentId,
    documentText,
    documentSourceUrl,
    documentHash,
    dataSourceConnectorProvider,
  });
  localLogger.info("Ran documents post process hook onUpsert function.");
}

export async function runPostDeleteHookActivity(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceId,
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
    auth: await Authenticator.internalBuilderForWorkspace(workspaceId),
    dataSourceId,
    documentId,
    dataSourceConnectorProvider,
  });
  localLogger.info("Ran documents post process hook ondelete function.");
}

async function getDataSourceDocument({
  workspaceId,
  dataSourceId,
  documentId,
}: {
  workspaceId: string;
  dataSourceId: string;
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

  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dataSourceId,
    // TODO(DATASOURCE_SID): clean-up
    { origin: "post_upsert_hook_activities" }
  );

  if (!dataSource) {
    return new Err(new Error(`Could not find data source ${dataSourceId}`));
  }
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const docText = await coreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId,
  });
  if (docText.isErr()) {
    return new Err(new Error(`Could not get document text for ${documentId}`));
  }
  return new Ok(docText.value);
}
