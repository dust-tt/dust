import type {
  ConnectorProvider,
  CoreAPIDataSource,
  CoreAPIDocument,
  Result,
  TrackerIdWorkspaceId,
} from "@dust-tt/types";
import {
  ConnectorsAPI,
  CoreAPI,
  Err,
  GPT_4O_MODEL_CONFIG,
  Ok,
} from "@dust-tt/types";
import { Context } from "@temporalio/activity";
import _ from "lodash";

import config from "@app/lib/api/config";
import { processTrackerNotification } from "@app/lib/api/tracker";
import { Authenticator } from "@app/lib/auth";
import { getDocumentDiff } from "@app/lib/document_upsert_hooks/hooks/data_source_helpers";
import { callDocTrackerRetrievalAction } from "@app/lib/document_upsert_hooks/hooks/tracker/actions/doc_tracker_retrieval";
import { callDocTrackerScoreDocsAction } from "@app/lib/document_upsert_hooks/hooks/tracker/actions/doc_tracker_score_docs";
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
// The maximum number of chunks to retrieve from the maintained scope.
const TRACKER_MAINTAINED_SCOPE_MAX_TOP_K = 8;

// The size of the chunks in our data sources.
// TODO(@fontanierh): find a way to ensure this remains true.
const CHUNK_SIZE = 512;

const TRACKER_SCORE_DOCS_MODEL_CONFIG = GPT_4O_MODEL_CONFIG;

export async function getDebounceMsActivity(
  dataSourceConnectorProvider: ConnectorProvider | null
): Promise<number> {
  if (!dataSourceConnectorProvider) {
    return 10000;
  }
  if (["notion", "google_drive"].includes(dataSourceConnectorProvider)) {
    return 600000;
  }
  return 3600000;
}

export async function trackersGenerationActivity(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null
) {
  if (Context.current().info.attempt > 1) {
    // TODO(DOC_TRACKER): mechanism to retry "manually"
    throw new Error("Too many attempts");
  }

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

  // We start by finding all trackers that are watching the modified document.

  const trackers = await getTrackersToRun(auth, dataSource, documentId);

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

  // We compute the diff between the current version of the document and the version right before the edit
  // that triggered the tracker.

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

  // We don't want to retrieve more than targetMaintainedScopeTokens / CHUNK_SIZE chunks,
  // in case all retrieved chunks are from the same document (in which case, we'd have
  // more than targetMaintainedScopeTokens tokens for that document).
  const maintainedScopeTopK = Math.min(
    TRACKER_MAINTAINED_SCOPE_MAX_TOP_K,
    Math.floor(targetMaintainedScopeTokens / CHUNK_SIZE)
  );

  if (maintainedScopeTopK === 0) {
    throw new Error(
      "Unreachable: targetMaintainedScopeTokens is less than CHUNK_SIZE."
    );
  }

  // We run each tracker.
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

    // We retrieve content from the maintained scope based on the diff.
    const maintainedScopeRetrieval = await callDocTrackerRetrievalAction(auth, {
      inputText: diffString,
      targetDocumentTokens: targetMaintainedScopeTokens,
      topK: maintainedScopeTopK,
      maintainedScope,
      parentsInMap,
    });

    if (maintainedScopeRetrieval.length === 0) {
      trackerLogger.info("No content retrieved from maintained scope.");
      continue;
    }

    const maintainedDocuments: {
      content: string;
      sourceUrl: string | null;
      title: string | null;
      dataSourceId: string;
      documentId: string;
    }[] = [];

    // For each document retrieved from the maintained scope, we build the content of the document.
    // We add "[...]" separators when there is a gap in the chunks (so the model understands that parts of the document are missing).
    for (const retrievalDoc of maintainedScopeRetrieval) {
      let docContent: string = "";
      const sortedChunks = _.sortBy(retrievalDoc.chunks, (c) => c.offset);

      for (const [i, chunk] of sortedChunks.entries()) {
        if (i === 0) {
          //  If we are at index 0 (i.e the first retrieved chunk), we check whether our chunk includes
          // the beginning of the document. If it doesn't, we add a "[...]"" separator.
          const allOffsetsInChunk = [
            chunk.offset,
            ...(chunk.expanded_offsets ?? []),
          ];
          const isBeginningOfDocument = allOffsetsInChunk.includes(0);
          if (!isBeginningOfDocument) {
            docContent += "[...]\n";
          }
        } else {
          // If we are not at index 0, we check whether the current chunk is a direct continuation of the previous chunk.
          // We do this by checking that the first offset of the current chunk is the last offset of the previous chunk + 1.
          const previousChunk = sortedChunks[i - 1];
          const allOffsetsInCurrentChunk = [
            chunk.offset,
            ...(chunk.expanded_offsets ?? []),
          ];
          const firstOffsetInCurrentChunk = _.min(allOffsetsInCurrentChunk)!;
          const allOffsetsInPreviousChunk = [
            previousChunk.offset,
            ...(previousChunk.expanded_offsets ?? []),
          ];
          const lastOffsetInPreviousChunk = _.max(allOffsetsInPreviousChunk)!;
          const hasGap =
            firstOffsetInCurrentChunk !== lastOffsetInPreviousChunk + 1;

          if (hasGap) {
            docContent += "[...]\n";
          }
        }

        // Add the chunk text to the document.
        docContent += chunk.text + "\n";

        if (i === sortedChunks.length - 1) {
          // If we are at the last chunk, we check if we have the last offset of the doc.
          // If not, we add a "[...]" separator.
          const lastChunk = sortedChunks[sortedChunks.length - 1];
          if (lastChunk.offset !== retrievalDoc.chunk_count - 1) {
            docContent += "[...]\n";
          }
        }
      }

      maintainedDocuments.push({
        content: docContent,
        sourceUrl: retrievalDoc.source_url,
        title: retrievalDoc.title,
        dataSourceId: retrievalDoc.data_source_id,
        documentId: retrievalDoc.document_id,
      });
    }

    const contentByDocumentIdentifier = _.mapValues(
      _.keyBy(
        maintainedDocuments,
        (doc) => `${doc.dataSourceId}__${doc.documentId}`
      ),
      (doc) => doc.content
    );

    // We find documents for which to run the change suggestion.
    // We do this by asking which documents are most relevant to the diff and using the
    // logprobs as a score.
    const scoreDocsResult = await callDocTrackerScoreDocsAction(auth, {
      watchedDocDiff: diffString,
      maintainedDocuments,
      prompt: tracker.prompt,
      providerId: TRACKER_SCORE_DOCS_MODEL_CONFIG.providerId,
      modelId: TRACKER_SCORE_DOCS_MODEL_CONFIG.modelId,
    });

    // The output of the Dust App above is a list of document for which we want to run the change suggestion.

    for (const {
      documentId: maintainedDocumentId,
      dataSourceId: maintainedDataSourceId,
      score,
    } of scoreDocsResult) {
      logger.info(
        {
          maintainedDocumentId,
          maintainedDataSourceId,
          score,
        },
        "Running document tracker suggest changes."
      );

      const content =
        contentByDocumentIdentifier[
          `${maintainedDataSourceId}__${maintainedDocumentId}`
        ];
      if (!content) {
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

      const maintainedDocumentDataSource =
        await DataSourceResource.fetchByDustAPIDataSourceId(
          auth,
          maintainedDataSourceId
        );
      if (!maintainedDocumentDataSource) {
        throw new Error(
          `Could not find maintained data source ${maintainedDataSourceId}`
        );
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
        maintainedDocumentDataSourceId: maintainedDocumentDataSource.sId,
        maintainedDocumentId,
      });
    }
  }
}

export async function shouldRunTrackersActivity(
  workspaceId: string,
  dataSourceId: string,
  documentId: string
): Promise<boolean> {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);

  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
  if (!dataSource) {
    throw new Error(`Could not find data source ${dataSourceId}`);
  }
  const trackers = await getTrackersToRun(auth, dataSource, documentId);
  return trackers.length > 0;
}

async function getTrackersToRun(
  auth: Authenticator,
  dataSource: DataSourceResource,
  documentId: string
): Promise<TrackerConfigurationResource[]> {
  const localLogger = logger.child({
    dataSourceId: dataSource.sId,
    documentId,
  });

  localLogger.info(
    "Looking for trackers with watched scope including document."
  );

  let docParentIds: string[] | null = null;

  if (dataSource.connectorProvider !== null) {
    if (dataSource.connectorId === null) {
      throw new Error(
        `Data source ${dataSource.sId} has no connector but connector provider is set. Cannot find parents.`
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
      throw parentsResult.error;
    }

    docParentIds = [
      documentId,
      ...parentsResult.value.nodes.flatMap((node) => node.parents),
    ];
  }

  return TrackerConfigurationResource.fetchAllWatchedForDocument(auth, {
    dataSourceId: dataSource.sId,
    parentIds: docParentIds,
  });
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
