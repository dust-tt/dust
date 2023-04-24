import { WebClient } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse.js";

import {
  Connector,
  sequelize_conn,
  SlackConfiguration,
} from "../../lib/models.js";
import { nango_client } from "../../lib/nango_client.js";
import { Err, Ok, type Result } from "../../lib/result.js";
import type { DataSourceConfig } from "../../types/data_source_config.js";
export type NangoConnectionId = string;

const { NANGO_SLACK_CONNECTOR_ID } = process.env;

export async function createSlackConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const res = await sequelize_conn.transaction(
    async (t): Promise<Result<Connector, Error>> => {
      const nango = nango_client();
      if (!NANGO_SLACK_CONNECTOR_ID) {
        throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
      }
      const slackAccessToken = (await nango.getToken(
        NANGO_SLACK_CONNECTOR_ID,
        nangoConnectionId
      )) as string;
      const client = new WebClient(slackAccessToken);

      const teamInfo = await client.team.info();
      if (teamInfo.ok !== true) {
        return new Err(
          new Error(
            `Could not get slack team info. Error message: ${
              teamInfo.error || "unknown"
            }`
          )
        );
      }
      if (!teamInfo.team?.id) {
        return new Err(
          new Error(
            `Could not get slack team id. Error message: ${
              teamInfo.error || "unknown"
            }`
          )
        );
      }

      const connector = await Connector.create(
        {
          type: "slack",
          nangoConnectionId,
          workspaceAPIKey: dataSourceConfig.APIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction: t }
      );

      await SlackConfiguration.create(
        {
          slackTeamId: teamInfo.team.id,
          connectorId: connector.id,
        },
        { transaction: t }
      );

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  return new Ok(res.value.id.toString());
}

/**
 * Show case only.
 */
export async function getChannels(
  nangoConnectionId: string
): Promise<Channel[]> {
  const nango = nango_client();
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
  }
  const slackAccessToken = (await nango.getToken(
    NANGO_SLACK_CONNECTOR_ID,
    nangoConnectionId
  )) as string;
  const client = new WebClient(slackAccessToken);
  const res = await client.conversations.list({
    types: "public_channel,private_channel",
    limit: 1000,
  });
  if (res.ok !== true) {
    throw new Error(
      `Could not get the channels. Reason: ${res.error || "unknown"}`
    );
  }

  return res.channels || [];
}
