import sgMail from "@sendgrid/mail";
import { Op } from "sequelize";

import { ConnectorProvider } from "@app/lib/connectors_api";
import { CoreAPI } from "@app/lib/core_api";
import { updateTrackedDocuments } from "@app/lib/document_tracker";
import { DataSource, TrackedDocument, User, Workspace } from "@app/lib/models";
import mainLogger from "@app/logger/logger";
import { PostUpsertHook } from "@app/post_upsert_hooks/hooks";
import { TRACKABLE_CONNECTOR_TYPES } from "@app/post_upsert_hooks/hooks/document_tracker/consts";
import { callDocTrackerAction } from "@app/post_upsert_hooks/hooks/document_tracker/lib";

const { RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS = "" } = process.env;
const { SENDGRID_API_KEY } = process.env;

const logger = mainLogger.child({
  postUpsertHook: "document_tracker",
});

export const documentTrackerPostUpsertHook: PostUpsertHook = {
  type: "document_tracker",
  filter: async (dataSourceName, workspaceId, documentId, documentText) => {
    const localLogger = logger.child({
      workspaceId,
      dataSourceName,
      documentId,
    });
    localLogger.info(
      "Checking if document tracker post upsert hook should run."
    );

    const whitelistedWorkspaceIds =
      RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS.split(",");

    if (!whitelistedWorkspaceIds.includes(workspaceId)) {
      localLogger.info(
        "Workspace not whitelisted, document_tracker post upsert hook should not run."
      );
      return false;
    }

    const dataSource = await getDatasource(dataSourceName, workspaceId);

    if (
      documentText.includes("DUST_TRACK(") &&
      TRACKABLE_CONNECTOR_TYPES.includes(
        dataSource.connectorProvider as ConnectorProvider
      )
    ) {
      localLogger.info(
        "Document includes DUST_TRACK tags, document_tracker post upsert hook should run."
      );
      return true;
    }

    const docIsTracked = !!(await TrackedDocument.count({
      where: {
        dataSourceId: dataSource.id,
        documentId,
      },
    }));

    if (docIsTracked) {
      // Always run the document tracker for tracked documents, so we can
      // garbage collect the TrackedDocuments if all the DUST_TRACK tags are removed.

      localLogger.info(
        "Document is tracked, document_tracker post upsert hook should run."
      );
      return true;
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

    return hasTrackedDocuments;
  },

  fn: async (dataSourceName, workspaceId, documentId, documentText) => {
    logger.info(
      {
        workspaceId,
        dataSourceName,
        documentId,
      },
      "Running document tracker post upsert hook."
    );

    const dataSource = await getDatasource(dataSourceName, workspaceId);
    if (
      TRACKABLE_CONNECTOR_TYPES.includes(
        dataSource.connectorProvider as ConnectorProvider
      )
    ) {
      logger.info("Updating tracked documents.");
      await updateTrackedDocuments(dataSource.id, documentId, documentText);
    }

    const isDocTracked = !!(await TrackedDocument.count({
      where: {
        dataSourceId: dataSource.id,
        documentId,
      },
    }));

    // TODO: see how we want to support this. Obviously the action in the current form will
    // just match the document that was just upserted
    if (isDocTracked) {
      logger.info("Document is tracked, not checking for matches.");
      return;
    }

    const actionResult = await callDocTrackerAction(workspaceId, documentText);

    if (actionResult.match) {
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

      const docId = actionResult.matched_doc_id;
      const trackedDocuments = await TrackedDocument.findAll({
        where: {
          documentId: docId,
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
            docId,
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

      const docUrl = actionResult.matched_doc_url;
      const suggestedChanges = actionResult.suggested_changes;

      const incomingDocument = await CoreAPI.getDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        documentId
      );

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
            docId,
            email,
          },
          "Sending email to user."
        );

        const msg = {
          to: email,
          from: "team@dust.tt",
          subject: "DUST: Document update suggestion",
          text: `Hello!

We have a suggestion for you to update the document ${docUrl}, based on the new document ${incomingDocumentUrl}:

${suggestedChanges}

The Dust team`,
        };

        await sgMail.send(msg);
      };

      await Promise.all(emails.map(sendEmail));
    }
  },
};

async function getDatasource(
  dataSourceName: string,
  workspaceId: string
): Promise<DataSource> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Could not find workspace with sId ${workspaceId}`);
  }
  const dataSource = await DataSource.findOne({
    where: {
      name: dataSourceName,
      workspaceId: workspace.id,
    },
  });
  if (!dataSource) {
    throw new Error(
      `Could not find data source with name ${dataSourceName} and workspaceId ${workspaceId}`
    );
  }
  return dataSource;
}
