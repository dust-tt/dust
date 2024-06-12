import type { ConnectorProvider } from "@dust-tt/types";

import { updateTrackedDocuments } from "@app/lib/document_tracker";
import type {
  DocumentsPostProcessHookFilterParams,
  DocumentsPostProcessHookOnDeleteParams,
  DocumentsPostProcessHookOnUpsertParams,
} from "@app/lib/documents_post_process_hooks/hooks";
import { getDatasource } from "@app/lib/documents_post_process_hooks/hooks/data_source_helpers";
import { TRACKABLE_CONNECTOR_TYPES } from "@app/lib/documents_post_process_hooks/hooks/document_tracker/consts";
import { TrackedDocument } from "@app/lib/models/doc_tracker";
import mainLogger from "@app/logger/logger";

const { RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS = "" } = process.env;

const logger = mainLogger.child({
  postProcessHook: "document_tracker_update_tracked_documents",
});

export async function shouldDocumentTrackerUpdateTrackedDocumentsRun(
  params: DocumentsPostProcessHookFilterParams
): Promise<boolean> {
  const owner = params.auth.workspace();
  if (!owner) {
    logger.info(
      "Workspace not found, document_tracker_update_tracked_documents post process hook should not run."
    );
    return false;
  }

  const localLogger = logger.child({
    workspaceId: owner.sId,
    dataSourceName: params.dataSourceName,
    documentId: params.documentId,
  });
  localLogger.info(
    "Checking if document_tracker_update_tracked_documents post process hook should run."
  );

  const whitelistedWorkspaceIds =
    RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS.split(",");

  if (!whitelistedWorkspaceIds.includes(owner.sId)) {
    localLogger.info(
      "Workspace not whitelisted, document_tracker_update_tracked_documents post process hook should not run."
    );
    return false;
  }

  const dataSource = await getDatasource(owner, params.dataSourceName);

  if (
    params.verb === "upsert" &&
    params.documentText.includes("DUST_TRACK(") &&
    TRACKABLE_CONNECTOR_TYPES.includes(
      dataSource.connectorProvider as ConnectorProvider
    )
  ) {
    localLogger.info(
      "Document includes DUST_TRACK tags, document_tracker_update_tracked_documents post process hook should run."
    );
    return true;
  }

  const docIsTracked = !!(await TrackedDocument.count({
    where: {
      dataSourceId: dataSource.id,
      documentId: params.documentId,
    },
  }));

  if (docIsTracked) {
    // Always run the document tracker for tracked documents, so we can
    // garbage collect the TrackedDocuments if all the DUST_TRACK tags are removed.

    localLogger.info(
      "Document is tracked, document_tracker_update_tracked_documents post process hook should run."
    );
    return true;
  }

  return false;
}

export async function documentTrackerUpdateTrackedDocumentsOnUpsert({
  auth,
  dataSourceName,
  documentId,
  documentText,
}: DocumentsPostProcessHookOnUpsertParams): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Workspace not found.");
  }
  logger.info(
    {
      workspaceId: owner.sId,
      dataSourceName,
      documentId,
    },
    "Running document_tracker_update_tracked_documents post upsert hook."
  );

  const dataSource = await getDatasource(owner, dataSourceName);
  if (
    TRACKABLE_CONNECTOR_TYPES.includes(
      dataSource.connectorProvider as ConnectorProvider
    )
  ) {
    logger.info("Updating tracked documents.");
    await updateTrackedDocuments(dataSource.id, documentId, documentText);
  }
}

export async function documentTrackerUpdateTrackedDocumentsOnDelete({
  auth,
  dataSourceName,
  documentId,
}: DocumentsPostProcessHookOnDeleteParams): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Workspace not found.");
  }

  logger.info(
    {
      workspaceId: owner.sId,
      dataSourceName,
      documentId,
    },
    "Running document_tracker_update_tracked_documents onDelete."
  );

  const dataSource = await getDatasource(owner, dataSourceName);

  await TrackedDocument.destroy({
    where: {
      dataSourceId: dataSource.id,
      documentId,
    },
  });
}
