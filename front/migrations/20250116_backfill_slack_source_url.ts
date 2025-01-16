import _ from "lodash";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1024;

// Copy-pasted from slack/lib/utils.ts
function getSlackChannelSourceUrl(
  slackChannelId: string,
  slackConfig: { slackTeamId: string }
): `https://app.slack.com/client/${string}/${string}` {
  return `https://app.slack.com/client/${slackConfig.slackTeamId}/${slackChannelId}`;
}

// Copy-pasted from slack/lib/utils.ts
export function slackChannelInternalIdFromSlackChannelId(
  channelId: string
): string {
  return `slack-channel-${_.last(channelId.split("slack-channel-"))!}`;
}

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  const slackConfigs: { slackTeamId: string }[] =
    await connectorsSequelize.query(
      `SELECT "slackTeamId"
       FROM slack_configurations
       WHERE "connectorId" = :connectorId
       LIMIT 1;`,
      {
        replacements: { connectorId: frontDataSource.connectorId },
        type: QueryTypes.SELECT,
      }
    );
  const slackConfig = slackConfigs[0];
  if (!slackConfig) {
    logger.error("No slack configuration found for data source");
    return;
  }

  await backfillChannels(
    slackConfig,
    frontDataSource,
    coreSequelize,
    connectorsSequelize,
    execute,
    logger.child({
      slackConfig,
      projectId: frontDataSource.dustAPIProjectId,
      dataSourceId: frontDataSource.dustAPIDataSourceId,
    })
  );
}

async function backfillChannels(
  slackConfig: { slackTeamId: string },
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing channels");

  // processing the channels chunk by chunk
  let lastId = 0;
  let rows: { id: number; slackChannelId: string }[] = [];

  do {
    // querying connectors for the next batch of channels
    rows = await connectorsSequelize.query(
      `SELECT id, "slackChannelId"
       FROM slack_channels
       WHERE id > :lastId
         AND "connectorId" = :connectorId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          lastId,
          connectorId: frontDataSource.connectorId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }
    // reconstructing the URLs and node IDs
    const urls = rows.map((row) =>
      getSlackChannelSourceUrl(row.slackChannelId, slackConfig)
    );
    const nodeIds = rows.map((row) => {
      return slackChannelInternalIdFromSlackChannelId(row.slackChannelId);
    });

    if (execute) {
      // const rows: { id: number }[] = await coreSequelize.query(
      //   `SELECT dsn.id
      //    FROM data_sources_nodes dsn
      //             JOIN data_sources ds ON ds.id = dsn.data_source
      //    WHERE dsn.node_id IN (:nodeIds)
      //      AND ds.data_source_id = :dataSourceId
      //      AND ds.project = :projectId;`, // leverages the index (ds, node_id)
      //   {
      //     replacements: {
      //       dataSourceId: frontDataSource.dustAPIDataSourceId,
      //       projectId: frontDataSource.dustAPIProjectId,
      //       nodeIds,
      //     },
      //     type: QueryTypes.SELECT,
      //   }
      // );
      // if (rows.length !== nodeIds.length) {
      //   logger.error("Did not retrieve all the nodes from data_sources_nodes");
      //   // skipping the datasource if we can't find all the nodes to prevent mismatches
      //   // if this happens, we will see if we do some sort of reconciliation strategy by selecting the node_ids as well
      //   return;
      // }

      // updating on core on the nodeIds
      await coreSequelize.query(
        `UPDATE data_sources_nodes
         SET source_url = urls.url
         FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                      unnest(ARRAY [:urls]::text[])    as url) urls
         WHERE data_sources_nodes.node_id = urls.node_id;`,
        { replacements: { urls, nodeIds } }
      );
      logger.info(
        `Updated ${rows.length} channels from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} channels from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();
  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "slack" },
  });
  logger.info(`Found ${frontDataSources.length} Slack data sources`);

  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      connectorsSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
      })
    );
  }
});
