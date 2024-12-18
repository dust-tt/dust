import type {
  ConnectorProvider,
  CoreAPIDataSource,
  CoreAPIDocument,
  Result,
  TrackerIdWorkspaceId,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Err, Ok } from "@dust-tt/types";
import _ from "lodash";

import config from "@app/lib/api/config";
import { processTrackerNotification } from "@app/lib/api/tracker";
import { Authenticator } from "@app/lib/auth";
import { getDocumentDiff } from "@app/lib/document_upsert_hooks/hooks/data_source_helpers";
import { callDocTrackerRetrievalAction } from "@app/lib/document_upsert_hooks/hooks/tracker/actions/doc_tracker_retrieval";
import { callDocTrackerSuggestChangesAction } from "@app/lib/document_upsert_hooks/hooks/tracker/actions/doc_tracker_suggest_changes";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import { withRetries } from "@app/lib/utils/retries";
import logger from "@app/logger/logger";

// If a diff is less than this number of characters, we don't run the tracker.
const TRACKER_WATCHED_DOCUMENT_MINIMUM_POSITIVE_DIFF_LENGTH = 32;
// If a diff line is less than this number of characters, we don't include it in the diff shown to the model.
const TRACKER_WATCHED_DOCUMENT_MINIMUM_DIFF_LINE_LENGTH = 4;
// If a diff is more than this number of tokens, we don't run the tracker.
const TRACKER_WATCHED_DOCUMENT_MAX_DIFF_TOKENS = 4096;
// The total number of tokens to show to the model (watched doc diff + maintained scope retrieved tokens)
const TRACKER_TOTAL_TARGET_TOKENS = 8192;
// The topK used for the semantic search against the maintained scope.
// TODO(DOC_TRACKER): Decide how we handle this. If the top doc has less than $targetDocumentTokens,
// we could include content from the next doc in the maintained scope.
const TRACKER_MAINTAINED_DOCUMENT_TOP_K = 1;

export async function trackersGenerationActivity(
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

  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);

  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
  if (!dataSource) {
    throw new Error(`Could not find data source ${dataSourceId}`);
  }

  localLogger.info(
    "Looking for trackers with watched scope including document."
  );

  let docParentIds: string[] | null = null;

  if (dataSourceConnectorProvider !== null) {
    if (dataSource.connectorId === null) {
      throw new Error(
        `Data source ${dataSourceId} has no connector but connector provider is set. Cannot find parents.`
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const parentsResult = await connectorsAPI.getContentNodesParents({
      connectorId: dataSource.connectorId,
      internalIds: [documentId],
    });
    if (parentsResult.isErr()) {
      localLogger.error(
        {
          error: parentsResult.error,
        },
        "Failed to get parents of document."
      );
      return;
    }

    docParentIds = [
      documentId,
      ...parentsResult.value.nodes.flatMap((node) => node.parents),
    ];
  }

  const trackers =
    await TrackerConfigurationResource.fetchAllWatchedForDocument(auth, {
      dataSourceId,
      parentIds: docParentIds,
    });

  if (!trackers.length) {
    localLogger.info("No active trackers found for document.");
    return;
  }

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

  // TODO(DOC_TRACKER): Do we skip if source URL is empty?
  if (!documentSourceUrl) {
    localLogger.warn(
      {
        documentSourceUrl,
      },
      "Document source URL is empty. Skipping document tracker."
    );
    return;
  }

  const documentDiff = await getDocumentDiff({
    dataSource,
    documentId,
    hash: documentHash,
  });
  const positiveDiff = documentDiff
    .filter(({ type }) => type === "insert")
    .map(({ value }) => value)
    .join("");

  if (
    positiveDiff.length < TRACKER_WATCHED_DOCUMENT_MINIMUM_POSITIVE_DIFF_LENGTH
  ) {
    localLogger.info(
      { positiveDiffLength: positiveDiff.length },
      "Positive diff is too short, not running trackers."
    );
    return;
  }

  const diffString = documentDiff
    .map(({ value, type }) => {
      if (type === "equal") {
        // For unchanged parts, show a context line (if not empty)
        const contextLine = value.split("\n")[0];
        return contextLine ? " " + contextLine + "\n..." : "";
      }
      // We skip diff lines that are too short, to reduce noise.
      if (
        value.trim().length <= TRACKER_WATCHED_DOCUMENT_MINIMUM_DIFF_LINE_LENGTH
      ) {
        return "";
      }
      const prefix = type === "insert" ? "+" : "-";
      return (
        value
          .split("\n")
          // Empty lines should still have a prefix
          .map((line) => prefix + (line || " "))
          .join("\n")
      );
    })
    .filter(Boolean)
    .join("\n");

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const tokensInDiff = await coreAPI.tokenize({
    text: diffString,
    providerId: "openai",
    modelId: "gpt-3.5-turbo",
  });
  if (tokensInDiff.isErr()) {
    throw tokensInDiff.error;
  }

  const tokensInDiffCount = tokensInDiff.value.tokens.length;
  if (tokensInDiffCount > TRACKER_WATCHED_DOCUMENT_MAX_DIFF_TOKENS) {
    localLogger.info(
      {
        tokensInDiffCount,
        positiveDiffLength: positiveDiff.length,
        maxTokens: TRACKER_WATCHED_DOCUMENT_MAX_DIFF_TOKENS,
      },
      "Diff is too long, not running trackers."
    );
    return;
  }

  const targetMaintainedScopeTokens =
    TRACKER_TOTAL_TARGET_TOKENS - tokensInDiffCount;

  for (const tracker of trackers) {
    const trackerLogger = localLogger.child({
      trackerId: tracker.sId,
    });

    trackerLogger.info("Running document tracker.");

    const maintainedScope = await tracker.fetchMaintainedScope();
    const maintainedDataSourceIds = _.uniq(
      maintainedScope.map((x) => x.dataSourceId)
    );
    const maintainedDataSources = await DataSourceResource.fetchByIds(
      auth,
      maintainedDataSourceIds
    );
    const maintainedDsCoreIdByDataSourceId = _.mapValues(
      _.keyBy(maintainedDataSources, (x) => x.sId),
      (x) => x.dustAPIDataSourceId
    );

    const parentsInMap = _.mapValues(
      _.keyBy(
        maintainedScope,
        (x) => maintainedDsCoreIdByDataSourceId[x.dataSourceId]
      ),
      (x) => x.filter?.parents?.in ?? null
    );

    const maintainedScopeRetrieval = await callDocTrackerRetrievalAction(auth, {
      inputText: diffString,
      targetDocumentTokens: targetMaintainedScopeTokens,
      topK: TRACKER_MAINTAINED_DOCUMENT_TOP_K,
      maintainedScope,
      parentsInMap,
    });

    // TODO(DOC_TRACKER): Right now we only handle the top match.
    // We may want to support topK > 1 and process more than 1 doc if the top doc has less than
    // $targetDocumentTokens.
    if (maintainedScopeRetrieval.length === 0) {
      trackerLogger.info("No content retrieved from maintained scope.");
      continue;
    }

    const content = maintainedScopeRetrieval[0].chunks
      .map((c) => c.text)
      .join("\n");
    if (!content) {
      trackerLogger.info("No content retrieved from maintained scope.");
      continue;
    }

    const suggestChangesResult = await callDocTrackerSuggestChangesAction(
      auth,
      {
        watchedDocDiff: diffString,
        maintainedDocContent: content,
        prompt: tracker.prompt,
        providerId: tracker.providerId,
        modelId: tracker.modelId,
      }
    );

    if (!suggestChangesResult.suggestion) {
      trackerLogger.info("No changes suggested.");
      continue;
    }

    const suggestedChanges = suggestChangesResult.suggestion;
    const thinking = suggestChangesResult.thinking;
    const confidenceScore = suggestChangesResult.confidence_score;

    trackerLogger.info(
      {
        confidenceScore,
      },
      "Changes suggested."
    );

    await tracker.addGeneration({
      generation: suggestedChanges,
      thinking: thinking ?? null,
      dataSourceId,
      documentId,
    });
  }
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
export const getTrackerIdsToNotifyActivity = async (
  currentRunMs: number
): Promise<TrackerIdWorkspaceId[]> => {
  const localLogger = logger.child({
    currentRunMs,
  });
  const results =
    TrackerConfigurationResource.internalFetchTrackersToNotify(currentRunMs);

  localLogger.info(
    {
      results,
    },
    "[Tracker] Fetching trackers to notify."
  );
  return results;
};

/**
 * Tracker Notification Workflow:
 * Activity to process tracker notification workflow activity.
 * Consumes generations for the tracker: fetches the generations, send notifications and consume them.
 */
export const processTrackerNotificationWorkflowActivity = async ({
  trackerId,
  workspaceId,
  currentRunMs,
}: {
  trackerId: number;
  workspaceId: string;
  currentRunMs: number;
}) => {
  const localLogger = logger.child({
    trackerId,
    workspaceId,
    currentRunMs,
  });

  localLogger.info(
    `[Tracker] Processing tracker ${trackerId} for workspace ${workspaceId}.\n\n`
  );

  await processTrackerNotification({
    trackerId,
    workspaceId,
    currentRunMs,
    localLogger,
  });

  localLogger.info(
    `[Tracker] Processed tracker ${trackerId} for workspace ${workspaceId}.`
  );
};
