import { Nango } from "@nangohq/node";
import { QueryTypes } from "sequelize";

import { getConnectorReplicaDbConnection } from "@app/production_checks/lib/utils";
import type { CheckFunction } from "@app/production_checks/types/check";

const { NANGO_SECRET_KEY, NANGO_SLACK_CONNECTOR_ID } = process.env;

export const nangoConnectionIdCleanupSlack: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  if (!NANGO_SECRET_KEY) {
    throw new Error("Env var NANGO_SECRET_KEY is not defined");
  }
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("Env var NANGO_SLACK_CONNECTOR_ID is not defined");
  }

  // Get all the Slack configurations in the database
  const connectorsSequelize = getConnectorReplicaDbConnection();
  const dbSlackConfigurationsData: { id: number; slackTeamId: string }[] =
    await connectorsSequelize.query(
      `SELECT id, "slackTeamId" FROM "slack_configurations"`,
      { type: QueryTypes.SELECT }
    );
  const dbSlackConfigurations = new Set(
    dbSlackConfigurationsData.map((sc) => sc.slackTeamId)
  );

  // Get all the Slack connections in Nango (created more than 1 hour ago)
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  const nango = new Nango({ secretKey: NANGO_SECRET_KEY });
  const nangoConnections = await nango.listConnections();
  const nangoSlackConnections = nangoConnections.connections.filter(
    (connection) => {
      const createdAt = new Date(connection.created);
      return (
        connection.provider === NANGO_SLACK_CONNECTOR_ID &&
        createdAt < oneHourAgo
      );
    }
  );

  // Check that all the Slack connections in Nango have a corresponding Slack configuration in the database
  const unknownNangoSlackConnections = [];
  for (const conn of nangoSlackConnections) {
    heartbeat();
    const connectionDetail = await nango.getConnection(
      conn.provider,
      conn.connection_id
    );
    const slackTeamId = connectionDetail.credentials.raw.team.id;
    if (!dbSlackConfigurations.has(slackTeamId)) {
      unknownNangoSlackConnections.push({
        connectionId: conn.connection_id,
        slackTeamId,
      });
    }
  }

  if (unknownNangoSlackConnections.length > 0) {
    reportFailure(
      { unknownConnections: unknownNangoSlackConnections },
      "Unknown Slack Teams in Nango"
    );
  } else {
    reportSuccess({});
  }
};
