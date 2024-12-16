import type {
  ConnectorProvider,
  CoreAPIDataSource,
  CoreAPIDocument,
  Result,
  TrackerIdWorkspaceId,
} from "@dust-tt/types";
import { CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { documentTrackerSuggestChanges } from "@app/lib/document_upsert_hooks/hooks/document_tracker/lib";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { withRetries } from "@app/lib/utils/retries";
import logger from "@app/logger/logger";

export async function runDocumentTrackerActivity(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null
) {
  const localLogger = logger.child({
    workspaceId,
    dataSourceId,
    documentId,
    dataSourceConnectorProvider,
  });

  localLogger.info("Running document tracker activity.");

  const dataSourceDocumentRes = await withRetries(getDataSourceDocument)({
    workspaceId,
    dataSourceId,
    documentId,
  });

  if (dataSourceDocumentRes.isErr()) {
    // TODO(DOC_TRACKER): allow to dinstinguish between deleted and "unreachable" docs.
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

  if (!documentText) {
    localLogger.warn(
      {
        documentText,
      },
      "Document text is empty. Skipping document tracker."
    );
    return;
  }

  if (!documentSourceUrl) {
    localLogger.warn(
      {
        documentSourceUrl,
      },
      "Document source URL is empty. Skipping document tracker."
    );
    return;
  }

  await documentTrackerSuggestChanges({
    auth: await Authenticator.internalAdminForWorkspace(workspaceId),
    dataSourceId,
    documentId,
    documentSourceUrl,
    documentHash,
  });
  localLogger.info("Ran documents post process hook onUpsert function.");
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

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
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

/**
 * Tracker Notification Workflow:
 * Activity to get tracker ids to notify activity.
 * They are the active trackers that have generations to consume.
 * @returns TrackerIdWorkspaceId[]
 */
export const getTrackerIdsToNotifyActivity = async (): Promise<
  TrackerIdWorkspaceId[]
> => {
  return TrackerConfigurationResource.internalFetchActivetrackersToProcessByNotificationWorkflow();
};

/**
 * Tracker Notification Workflow:
 * Activity to process tracker notification workflow activity.
 * Consumes generations for the tracker: fetches the generations, send notifications and consume them.
 */
export const processTrackerNotificationWorkflowActivity = async ({
  trackerId,
  workspaceId,
  currentSyncMs,
}: {
  trackerId: number;
  workspaceId: string;
  currentSyncMs: number;
}) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const tracker =
    await TrackerConfigurationResource.fetchWithGenerationsToConsume(
      auth,
      trackerId
    );
  if (!tracker) {
    logger.error(
      {
        trackerId,
      },
      "[Tracker] Tracker not found."
    );
    return;
  }

  const generations = tracker.generations;
  if (!generations?.length) {
    return;
  }

  if (!tracker.recipients?.length) {
    logger.error(
      {
        trackerId: tracker.id,
      },
      "[Tracker] No recipients found for tracker. Should not be possible from the UI."
    );
    return;
  }

  // @todo Implement the notification logic here.
  void currentSyncMs;
};
