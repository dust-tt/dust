// Ad-hoc cleanup for a google_drive data source whose core-side state is broken (poke details
// 404s on the core data source) and whose scrub/GC workflows can no longer be launched. Runs the
// scrub path (hardDeleteDataSource) inline: deletes GCS files, force-deletes the connector (all
// google_drive_* rows in connectors), deletes the core data source (SQL + qdrant + search index,
// tolerated if already gone) and hard-deletes the front data source, its views and agent/skill
// configurations.
import config from "@app/lib/api/config";
import { hardDeleteDataSource } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { makeScript } from "@app/scripts/helpers";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { CoreAPI } from "@app/types/core/core_api";

makeScript(
  {
    wId: {
      type: "string",
      required: true,
      description: "Workspace sId",
    },
    dsId: {
      type: "string",
      required: true,
      description: "Data source sId (dts_...)",
    },
  },
  async ({ wId, dsId, execute }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(wId);

    const dataSource = await DataSourceResource.fetchById(auth, dsId, {
      includeDeleted: true,
    });
    if (!dataSource) {
      logger.error({ wId, dsId }, "Data source not found on front");
      return;
    }

    if (dataSource.connectorProvider !== "google_drive") {
      logger.error(
        { dsId, connectorProvider: dataSource.connectorProvider },
        "Data source is not a google_drive connector, aborting"
      );
      return;
    }

    logger.info(
      {
        dsId: dataSource.sId,
        connectorId: dataSource.connectorId,
        dustAPIProjectId: dataSource.dustAPIProjectId,
        dustAPIDataSourceId: dataSource.dustAPIDataSourceId,
        deletedAt: dataSource.deletedAt,
      },
      "Found front data source"
    );

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const coreDataSourceRes = await coreAPI.getDataSource({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
    });
    if (coreDataSourceRes.isErr()) {
      logger.info(
        { error: coreDataSourceRes.error },
        "Core data source not reachable (already deleted?): core-side deletion will be a no-op"
      );
    } else {
      const documentsRes = await coreAPI.getDataSourceDocuments(
        {
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
        },
        { limit: 1, offset: 0 }
      );
      logger.info(
        {
          coreDataSourceId: coreDataSourceRes.value.data_source.data_source_id,
          totalDocuments: documentsRes.isOk()
            ? documentsRes.value.total
            : "unknown",
        },
        "Core data source found: scrub will delete all its documents, tables, folders and qdrant points"
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    if (dataSource.connectorId) {
      const connectorRes = await connectorsAPI.getConnector(
        dataSource.connectorId
      );
      if (connectorRes.isErr()) {
        logger.info(
          { connectorId: dataSource.connectorId, error: connectorRes.error },
          "Connector not reachable (already deleted?)"
        );
      } else {
        logger.info(
          { connectorId: dataSource.connectorId },
          "Connector found: force-delete will remove all google_drive_* rows (files, folders, sheets, sync tokens, config)"
        );
      }
    }

    if (!execute) {
      return;
    }

    // Same code path as scrubDataSourceActivity. Tolerates an already-deleted connector
    // (connector_not_found) and an already-deleted core data source; throws on anything else.
    const res = await hardDeleteDataSource(auth, dataSource);
    if (res && res.isErr()) {
      logger.error({ error: res.error }, "Hard delete failed");
      return;
    }

    const postCoreRes = await coreAPI.getDataSource({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
    });
    const postFront = await DataSourceResource.fetchById(auth, dsId, {
      includeDeleted: true,
    });
    const postConnectorGone = dataSource.connectorId
      ? (await connectorsAPI.getConnector(dataSource.connectorId)).isErr()
      : true;

    logger.info(
      {
        frontDataSourceGone: postFront === null,
        coreDataSourceGone: postCoreRes.isErr(),
        connectorGone: postConnectorGone,
      },
      "Post-deletion state"
    );
  }
);
