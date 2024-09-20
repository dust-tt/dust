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

const MINIMUM_POSITIVE_DIFF_LENGTH = 20;
const MAX_DIFF_TOKENS = 4000;
const TOTAL_TARGET_TOKENS = 6000;
const RETRIEVAL_MIN_SCORE = 0.78;

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
  // TODO: see how we want to support this. Obviously the action in the current form will
  // just match the document that was just upserted if it's tracked.
  // We check this in the filter, but there could be a race condition.
  if (isDocTracked) {
    localLogger.info("Document is tracked: not searching for matches.");
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
  if (positiveDiff.length < MINIMUM_POSITIVE_DIFF_LENGTH) {
    localLogger.info(
      {
        positiveDiffLength: positiveDiff.length,
      },
      "Positive diff is too short, not searching for matches."
    );

    return;
  }

  const diffText = documentDiff
    .filter(({ type }) => type !== "equal")
    .map(({ value, type }) => `[[**${type}**:\n${value}]]`)
    .join("\n");

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const tokensInDiff = await coreAPI.tokenize({
    text: diffText,
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

  const targetDocumentTokens = TOTAL_TARGET_TOKENS - tokensInDiffCount;

  localLogger.info(
    {
      positiveDiffLength: positiveDiff.length,
      tokensInDiffCount,
    },
    "Calling doc tracker retrieval action."
  );
  const retrievalResult = await callDocTrackerRetrievalAction(
    auth,
    diffText,
    targetDocumentTokens
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

  // TODO: maybe not just look at top1, look at top 3 chunks and do on multiple docs if needed
  const top1 = retrievedTrackedDocuments[0];
  const score = top1.chunks[0].score;

  if (score < RETRIEVAL_MIN_SCORE) {
    localLogger.info(
      { score },
      "Score is too low, not calling doc tracker suggest changes action."
    );
    return;
  }

  localLogger.info({ score }, "Calling doc tracker suggest changes action.");

  const suggestChangesResult = await callDocTrackerSuggestChangesAction(
    auth,
    diffText,
    top1.chunks.map((c) => c.text).join("\n-------\n")
  );

  if (!suggestChangesResult.match) {
    localLogger.info({ score }, "No match found.");
    return;
  }

  const suggestedChanges = suggestChangesResult.suggested_changes;
  const reason = suggestChangesResult.reason;
  const matchedDsName = top1.data_source_id;
  const matchedDocId = top1.document_id;
  const matchedDocUrl = top1.source_url;
  const matchedDocTitle = getDocumentTitle(top1.tags);

  localLogger.info(
    {
      matchedDsName,
      matchedDocId,
      matchedDocUrl,
      matchedDocTitle,
      score,
    },
    "Match found."
  );

  const matchedDs = await DataSourceResource.fetchByNameOrId(
    auth,
    matchedDsName,
    // TODO(DATASOURCE_SID): clean-up we have an assumption here that core.data_source_id is
    // retrievable in front. Here as name, in the future as sId. This should be a fetch by
    // dustAPIDataSourceId but we need the project_id as well in the response which is not
    // desirable.
    {
      origin: "document_tracker",
    }
  );
  if (!matchedDs) {
    throw new Error(
      `Could not find data source with name ${matchedDsName} and workspace ${owner.sId}`
    );
  }

  // again, checking for race condition here and skipping if the
  // matched doc is the doc that was just upserted.
  if (matchedDs.id === dataSource.id && matchedDocId === documentId) {
    localLogger.info(
      {
        matchedDsName,
        matchedDocId,
      },
      "Matched document is the document that was just upserted."
    );
    return;
  }

  const trackedDocuments = await TrackedDocument.findAll({
    where: {
      documentId: matchedDocId,
      dataSourceId: matchedDs.id,
    },
  });
  if (!trackedDocuments.length) {
    localLogger.warn(
      {
        matchedDsName,
        matchedDocId,
      },
      "Could not find tracked documents for matched document."
    );
    return;
  }

  logger.info(
    {
      matchedDsName,
      matchedDocId,
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
        reason,
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

  const incomingDocument = await coreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId,
  });
  if (incomingDocument.isErr()) {
    throw new Error(
      `Could not get document ${documentId} from data source ${dataSource.name}`
    );
  }

  const incomingDocumentTitle = getDocumentTitle(
    incomingDocument.value.document.tags
  );

  await Promise.all(
    emails.map((email) =>
      sendSuggestionEmail({
        recipientEmail: email,
        matchedDocumentTitle: matchedDocTitle,
        matchedDocumentUrl: matchedDocUrl,
        incomingDocumentTitle: incomingDocumentTitle,
        incomingDocumentUrl: documentSourceUrl,
        suggestedChanges: suggestedChanges,
      })
    )
  );
}

async function sendSuggestionEmail({
  recipientEmail,
  matchedDocumentTitle,
  matchedDocumentUrl,
  incomingDocumentTitle,
  incomingDocumentUrl,
  suggestedChanges,
}: {
  recipientEmail: string;
  matchedDocumentTitle: string | null;
  matchedDocumentUrl: string | null;
  incomingDocumentTitle: string | null;
  incomingDocumentUrl: string;
  suggestedChanges: string;
}) {
  const localLogger = logger.child({
    recipientEmail,
    matchedDocumentTitle,
    matchedDocumentUrl,
    incomingDocumentTitle,
    incomingDocumentUrl,
  });

  if (!SENDGRID_API_KEY) {
    throw new Error("Missing SENDGRID_API_KEY env variable");
  }
  sgMail.setApiKey(SENDGRID_API_KEY);

  localLogger.info("Sending email to user.");

  const matchedDocumentName = matchedDocumentTitle || matchedDocumentUrl;
  const incomingDocumentName = incomingDocumentTitle || incomingDocumentUrl;

  const matchedDocumentLink = matchedDocumentUrl
    ? `<a href="${matchedDocumentUrl}">${matchedDocumentName}</a>`
    : "<No link>";
  const incomingDocumentLink = `<a href="${incomingDocumentUrl}">${incomingDocumentName}</a>`;

  const htmlSuggestion = new showdown.Converter().makeHtml(suggestedChanges);

  const msg = {
    to: recipientEmail,
    from: "team@dust.tt",
    subject: `DUST: Document update suggestion for ${matchedDocumentName}`,
    html:
      "Hello!<br>" +
      `We have a suggestion for you to update the document ${matchedDocumentLink} ` +
      `based on the new document ${incomingDocumentLink}:<br>` +
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
