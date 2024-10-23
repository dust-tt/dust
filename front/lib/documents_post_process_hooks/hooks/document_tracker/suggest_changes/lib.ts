import { CoreAPI } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";
import { Op } from "sequelize";
import showdown from "showdown";

import config from "@app/lib/api/config";
import type {
  DocumentsPostProcessHookFilterParams,
  DocumentsPostProcessHookOnUpsertParams,
} from "@app/lib/documents_post_process_hooks/hooks";
import {
  getDatasource,
  getDocumentDiff,
} from "@app/lib/documents_post_process_hooks/hooks/data_source_helpers";
import {
  DocumentTrackerChangeSuggestion,
  TrackedDocument,
} from "@app/lib/models/doc_tracker";
import { User } from "@app/lib/models/user";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import mainLogger from "@app/logger/logger";

import { callDocTrackerRetrievalAction } from "./actions/doc_tracker_retrieval";
import { callDocTrackerSuggestChangesAction } from "./actions/doc_tracker_suggest_changes";

const { SENDGRID_API_KEY } = process.env;

// If the sum of all INSERT diffs is less than this number, we skip the hook.
const MINIMUM_POSITIVE_DIFF_LENGTH = 32;

// If a diff line is less than this number of characters, we don't include it in the diff shown to the model.
const MINIMUM_DIFF_LINE_LENGTH = 8;

// If the diff string is more than this number of tokens, we skip the hook.
const MAX_DIFF_TOKENS = 4096;

// The total number of tokens we want to show to the model, including both the diff and the tracked document.
const TOTAL_TARGET_TOKENS = 8192;

// The maximum number of tracked documents that we process for one diff.
const MAX_TRACKED_DOCUMENTS = 3;

const logger = mainLogger.child({
  postProcessHook: "document_tracker_suggest_changes",
});

export async function shouldDocumentTrackerSuggestChangesRun(
  params: DocumentsPostProcessHookFilterParams
): Promise<boolean> {
  if (params.verb !== "upsert") {
    logger.info(
      "document_tracker_suggest_changes post process hook should only run for upsert."
    );
    return false;
  }

  const {
    upsertContext,
    auth,
    dataSourceId,
    documentId,
    dataSourceConnectorProvider,
  } = params;
  const isBatchSync = upsertContext?.sync_type === "batch";

  if (isBatchSync) {
    logger.info(
      "document_tracker_suggest_changes post process hook should not run for batch sync."
    );
    return false;
  }

  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Workspace not found.");
  }

  const localLogger = logger.child({
    workspaceId: owner.sId,
    dataSourceId,
    documentId,
  });

  if (!owner.flags.includes("document_tracker")) {
    return false;
  }

  if (dataSourceConnectorProvider === "slack") {
    // kind of a hack, but we don't want to run this hook for slack non-thread docs
    if (!documentId.includes("-thread-")) {
      localLogger.info(
        "Slack Document is not a thread, document_tracker_suggest_changes post process hook should not run."
      );
      return false;
    }
  }

  const dataSource = await getDatasource(auth, dataSourceId);

  const docIsTracked = !!(await TrackedDocument.count({
    where: {
      dataSourceId: dataSource.id,
      documentId,
    },
  }));

  if (docIsTracked) {
    // Never run document_tracker_suggest_changes for tracked documents.
    // Documents are either sources or targets, not both.
    // TODO: let's revisit this decision later.
    // TODO: should we also skip docs that have DUST_TRACK tags?
    localLogger.info(
      "Document is tracked, document_tracker_suggest_changes post process hook should not run."
    );
    return false;
  }

  const workspaceDataSourceIds = (
    await DataSourceResource.listByWorkspace(auth)
  ).map((ds) => ds.id);

  const hasTrackedDocuments = !!(await TrackedDocument.count({
    where: {
      dataSourceId: {
        [Op.in]: workspaceDataSourceIds,
      },
      documentId: {
        [Op.not]: documentId,
      },
    },
  }));

  if (hasTrackedDocuments) {
    localLogger.info(
      "Workspace has tracked documents, document_tracker_suggest_changes post process hook should run."
    );
    return true;
  }

  localLogger.info(
    "Workspace has no tracked documents, document_tracker_suggest_changes post process hook should not run."
  );

  return false;
}

export async function documentTrackerSuggestChangesOnUpsert({
  auth,
  dataSourceId,
  documentId,
  documentHash,
  documentSourceUrl,
}: DocumentsPostProcessHookOnUpsertParams): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Workspace not found.");
  }

  const localLogger = logger.child({
    workspaceId: owner.sId,
    dataSourceId,
    documentId,
    documentHash,
  });

  if (!documentSourceUrl) {
    localLogger.error("Document source url is missing.");

    return;
  }

  localLogger.info(
    "Running document_tracker_suggest_changes post upsert hook."
  );

  const dataSource = await getDatasource(auth, dataSourceId);
  const isDocTracked = !!(await TrackedDocument.count({
    where: {
      dataSourceId: dataSource.id,
      documentId,
    },
  }));

  if (isDocTracked) {
    localLogger.info(
      "Modified document is tracked: not searching for matches."
    );
    return;
  }

  const modifiedDocumentDiffs = await getDocumentDiff({
    dataSource,
    documentId,
    hash: documentHash,
  });

  const positiveDiff = modifiedDocumentDiffs
    .filter(({ type }) => type === "insert")
    .map(({ value }) => value)
    .join("");

  if (positiveDiff.length < MINIMUM_POSITIVE_DIFF_LENGTH) {
    localLogger.info(
      { positiveDiffLength: positiveDiff.length },
      "Positive diff is too short, not searching for matches."
    );
    return;
  }

  const diffString = modifiedDocumentDiffs
    .map(({ value, type }) => {
      if (type === "equal") {
        // For unchanged parts, show a context line (if not empty)
        const contextLine = value.split("\n")[0];
        return contextLine ? " " + contextLine + "\n..." : "";
      }
      if (value.trim().length <= MINIMUM_DIFF_LINE_LENGTH) {
        return ""; // Skip diffs that are 16 characters or less
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
  if (tokensInDiffCount > MAX_DIFF_TOKENS) {
    localLogger.info(
      { tokensInDiffCount, positiveDiffLength: positiveDiff.length },
      "Diff is too long, not searching for matches."
    );
    return;
  }

  const targetTrackedDocumentTokens = TOTAL_TARGET_TOKENS - tokensInDiffCount;

  localLogger.info(
    {
      positiveDiffLength: positiveDiff.length,
      tokensInDiffCount,
    },
    "Calling doc tracker retrieval action."
  );
  const retrievalResult = await callDocTrackerRetrievalAction(
    auth,
    diffString,
    targetTrackedDocumentTokens
  );

  if (!retrievalResult.length) {
    localLogger.warn("No documents found.");
    return;
  }

  const retrievedTrackedDocuments = retrievalResult.filter((r) =>
    r.tags.includes("__DUST_TRACKED")
  );

  if (!retrievedTrackedDocuments.length) {
    localLogger.info(
      "No tracked documents retrieved, not calling doc tracker suggest changes action."
    );
    return;
  }

  localLogger.info(
    {
      retrievedTrackedDocumentsCount: retrievedTrackedDocuments.length,
    },
    "Retrieved tracked documents."
  );

  for (const trackedDoc of retrievedTrackedDocuments.slice(
    0,
    MAX_TRACKED_DOCUMENTS
  )) {
    let trackedDocLocalLogger = localLogger.child({
      trackedDocDataSourceId: trackedDoc.data_source_id,
      trackedDocId: trackedDoc.document_id,
      trackedDocScore: trackedDoc.chunks[0].score,
      diffTokens: tokensInDiffCount,
    });

    trackedDocLocalLogger.info("Calling doc tracker suggest changes action.");

    const suggestChangesResult = await callDocTrackerSuggestChangesAction(
      auth,
      diffString,
      trackedDoc.chunks.map((c) => c.text).join("\n-------\n")
    );

    if (!suggestChangesResult.suggestion) {
      trackedDocLocalLogger.info("No match found.");
      return;
    }

    const suggestedChanges = suggestChangesResult.suggestion;
    const thinking = suggestChangesResult.thinking;
    const confidenceScore = suggestChangesResult.confidence_score;

    trackedDocLocalLogger = trackedDocLocalLogger.child({
      confidenceScore,
      hasChanges: !!suggestedChanges,
    });

    const {
      data_source_id: trackedDocDataSourceId,
      document_id: trackedDocId,
      source_url: trackedDocSourceUrl,
    } = trackedDoc;

    const trackedDocTitle = getDocumentTitle(trackedDoc.tags);

    trackedDocLocalLogger.info(
      {
        trackedDocDataSourceId,
        trackedDocId,
        trackedDocSourceUrl,
        trackedDocTitle,
      },
      "Match found."
    );

    const trackedDocDataSource =
      await DataSourceResource.fetchByDustAPIDataSourceId(
        auth,
        trackedDocDataSourceId
      );

    if (!trackedDocDataSource) {
      trackedDocLocalLogger.warn(
        {
          trackedDocDataSourceId,
        },
        "Could not find data source for tracked document."
      );
      return;
    }

    // again, checking for race condition here and skipping if the
    // tracked doc is the doc that was just upserted.
    if (
      trackedDocDataSource.id === dataSource.id &&
      trackedDocId === documentId
    ) {
      trackedDocLocalLogger.info(
        {
          trackedDocDataSourceId,
          trackedDocId,
        },
        "Matched tracked document is the document that was just upserted."
      );
      return;
    }

    const trackedDocuments = await TrackedDocument.findAll({
      where: {
        documentId: trackedDocId,
        dataSourceId: trackedDocDataSourceId,
      },
    });
    if (!trackedDocuments.length) {
      localLogger.warn(
        {
          trackedDocDataSourceId,
          trackedDocId,
        },
        "Could not find tracked documents for matched document."
      );
      return;
    }

    logger.info(
      {
        trackedDocDataSourceId,
        trackedDocId,
      },
      "Creating change suggestions in database."
    );
    await Promise.all(
      trackedDocuments.map((td) =>
        DocumentTrackerChangeSuggestion.create({
          trackedDocumentId: td.id,
          sourceDataSourceId: dataSource.id,
          sourceDocumentId: documentId,
          suggestion: suggestedChanges,
          status: "pending",
          reason: thinking,
        })
      )
    );

    const users = await User.findAll({
      where: {
        id: {
          [Op.in]: trackedDocuments.map((td) => td.userId),
        },
      },
    });
    const emails = users.map((u) => u.email);

    const modifiedDocument = await coreAPI.getDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId,
    });
    if (modifiedDocument.isErr()) {
      throw new Error(
        `Could not get document ${documentId} from data source ${dataSource.name}`
      );
    }

    const modifiedDocumentTitle = getDocumentTitle(
      modifiedDocument.value.document.tags
    );

    await Promise.all(
      emails.map((email) =>
        sendSuggestionEmail({
          recipientEmail: email,
          trackedDocumentTitle: trackedDocTitle,
          trackedDocumentUrl: trackedDocSourceUrl,
          modifiedDocumentTitle,
          modifiedDocumentUrl: documentSourceUrl,
          suggestedChanges: suggestedChanges,
        })
      )
    );
  }
}

async function sendSuggestionEmail({
  recipientEmail,
  trackedDocumentTitle,
  trackedDocumentUrl,
  modifiedDocumentTitle,
  modifiedDocumentUrl,
  suggestedChanges,
}: {
  recipientEmail: string;
  trackedDocumentTitle: string | null;
  trackedDocumentUrl: string | null;
  modifiedDocumentTitle: string | null;
  modifiedDocumentUrl: string;
  suggestedChanges: string;
}) {
  const localLogger = logger.child({
    recipientEmail,
    trackedDocumentTitle,
    trackedDocumentUrl,
    modifiedDocumentTitle,
    modifiedDocumentUrl,
  });

  if (!SENDGRID_API_KEY) {
    throw new Error("Missing SENDGRID_API_KEY env variable");
  }
  sgMail.setApiKey(SENDGRID_API_KEY);

  localLogger.info("Sending email to user.");

  const trackedDocumentName = trackedDocumentTitle || trackedDocumentUrl;
  const modifiedDocumentName = modifiedDocumentTitle || modifiedDocumentUrl;

  const trackedDocumentLink = trackedDocumentUrl
    ? `<a href="${trackedDocumentUrl}">${trackedDocumentName}</a>`
    : "<No link>";
  const modifiedDocumentLink = `<a href="${modifiedDocumentUrl}">${modifiedDocumentName}</a>`;

  const htmlSuggestion = new showdown.Converter().makeHtml(suggestedChanges);

  const msg = {
    to: recipientEmail,
    from: "support@dust.tt",
    subject: `DUST: Document update suggestion for ${trackedDocumentName}`,
    html:
      "Hello!<br>" +
      `We have a suggestion for you to update the document ${trackedDocumentLink} ` +
      `based on the modified document ${modifiedDocumentLink}:<br>` +
      `${htmlSuggestion}<br>` +
      `The Dust team`,
  };
  await sgMail.send(msg);
}

function getDocumentTitle(tags: string[]): string | null {
  const maybeTitleTag = tags.find((t) => t.startsWith("title:"));
  if (!maybeTitleTag) {
    return null;
  }
  return maybeTitleTag.split("title:")[1];
}
