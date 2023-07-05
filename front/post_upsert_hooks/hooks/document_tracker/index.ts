import { Op } from "sequelize";

import { ConnectorProvider } from "@app/lib/connectors_api";
import { updateTrackedDocuments } from "@app/lib/document_tracker";
import { DataSource, TrackedDocument, Workspace } from "@app/lib/models";
import mainLogger from "@app/logger/logger";
import { PostUpsertHook } from "@app/post_upsert_hooks/hooks";
import { TRACKABLE_CONNECTOR_TYPES } from "@app/post_upsert_hooks/hooks/document_tracker/consts";

const { RUN_DOCUMENT_TRACKER_FOR_WORKSPACE_IDS = "" } = process.env;

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

    logger.info(
      "Should check if any tracked documents need to be updated. [TODO]"
    );
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
