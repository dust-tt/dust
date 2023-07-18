import sgMail from "@sendgrid/mail";
import { Op } from "sequelize";

import {
  DocumentsPostProcessHookFilterParams,
  DocumentsPostProcessHookOnUpsertParams,
} from "@app/documents_post_process_hooks/hooks";
import { callLegacyDocTrackerAction } from "@app/documents_post_process_hooks/hooks/document_tracker/suggest_changes/actions/doc_tracker_legacy";
import {
  getDatasource,
  getDocumentDiff,
} from "@app/documents_post_process_hooks/hooks/lib/data_source_helpers";
import { CoreAPI } from "@app/lib/core_api";
import { DataSource, TrackedDocument, User, Workspace } from "@app/lib/models";
import mainLogger from "@app/logger/logger";

const { RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS = "" } = process.env;
const { SENDGRID_API_KEY } = process.env;

const MINIMUM_POSITIVE_DIFF_LENGTH = 20;

const logger = mainLogger.child({
  postProcessHook: "document_tracker_suggest_changes",
});

export async function shouldDocumentTrackerSuggestChangesRun({
  dataSourceName,
  workspaceId,
  documentId,
  dataSourceConnectorProvider,
  verb,
}: DocumentsPostProcessHookFilterParams): Promise<boolean> {
  if (verb !== "upsert") {
    logger.info(
      "document_tracker_suggest_changes post process hook should only run for upsert."
    );
    return false;
  }

  const localLogger = logger.child({
    workspaceId,
    dataSourceName,
    documentId,
  });
  localLogger.info(
    "Checking if document_tracker_suggest_changes post process hook should run."
  );

  const whitelistedWorkspaceIds =
    RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS.split(",");

  if (!whitelistedWorkspaceIds.includes(workspaceId)) {
    localLogger.info(
      "Workspace not whitelisted, document_tracker_suggest_changes post process hook should not run."
    );
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

  const dataSource = await getDatasource(dataSourceName, workspaceId);

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
    await DataSource.findAll({
      where: { workspaceId: dataSource.workspaceId },
      attributes: ["id"],
    })
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
  dataSourceName,
  workspaceId,
  documentId,
  documentHash,
}: DocumentsPostProcessHookOnUpsertParams): Promise<void> {
  logger.info(
    {
      workspaceId,
      dataSourceName,
      documentId,
    },
    "Running document_tracker_suggest_changes post upsert hook."
  );
  const dataSource = await getDatasource(dataSourceName, workspaceId);
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
    logger.info(
      {
        workspaceId,
        dataSourceName,
        documentId,
      },
      "Document is tracked: not searching for matches."
    );
    return;
  }
  const documentDiff = await getDocumentDiff({
    dataSourceName: dataSource.name,
    workspaceId,
    documentId,
    hash: documentHash,
  });

  const positiveDiff = documentDiff
    .filter(({ type }) => type === "insert")
    .join("");
  if (positiveDiff.length < MINIMUM_POSITIVE_DIFF_LENGTH) {
    logger.info(
      {
        workspaceId,
        dataSourceName,
        documentId,
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
  const actionResult = await callLegacyDocTrackerAction(workspaceId, diffText);
  if (!actionResult.match) {
    logger.info(
      {
        workspaceId,
        dataSourceName,
        documentId,
      },
      "No match found."
    );
    return;
  }

  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  const matchedDsName = actionResult.matched_data_source_id;
  const matchedDs = await DataSource.findOne({
    where: {
      name: matchedDsName,
      workspaceId: workspace.id,
    },
  });
  if (!matchedDs) {
    throw new Error(
      `Could not find data source with name ${matchedDsName} and workspaceId ${workspaceId}`
    );
  }
  const matchedDocId = actionResult.matched_doc_id;
  // again, checking for race condition here and skipping if the
  // matched doc is the doc that was just upserted.
  if (matchedDs.id === dataSource.id && matchedDocId === documentId) {
    logger.info(
      {
        workspaceId,
        dataSourceName,
        documentId,
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
    logger.warn(
      {
        workspaceId,
        dataSourceName,
        documentId,
        matchedDsName,
        matchedDocId,
      },
      "Could not find tracked documents for matched document."
    );
    return;
  }
  const users = await User.findAll({
    where: {
      id: {
        [Op.in]: trackedDocuments.map((td) => td.userId),
      },
    },
  });
  const emails = users.map((u) => u.email);
  if (!SENDGRID_API_KEY) {
    throw new Error("Missing SENDGRID_API_KEY env variable");
  }
  sgMail.setApiKey(SENDGRID_API_KEY);
  const matchedDocUrl = actionResult.matched_doc_url;
  const suggestedChanges = actionResult.suggested_changes;
  const incomingDocument = await CoreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceName: dataSource.name,
    documentId,
  });
  if (incomingDocument.isErr()) {
    throw new Error(
      `Could not get document ${documentId} from data source ${dataSource.name}`
    );
  }
  const incomingDocumentUrl = incomingDocument.value.document.source_url;
  const sendEmail = async (email: string) => {
    logger.info(
      {
        workspaceId,
        dataSourceName,
        documentId,
        matchedDsName,
        matchedDocId,
        email,
      },
      "Sending email to user."
    );
    const msg = {
      to: email,
      from: "team@dust.tt",
      subject: "DUST: Document update suggestion",
      text: `Hello!
  We have a suggestion for you to update the document ${matchedDocUrl}, based on the new document ${incomingDocumentUrl}:
  ${suggestedChanges}
  The Dust team`,
    };
    await sgMail.send(msg);
  };
  await Promise.all(emails.map(sendEmail));
}
