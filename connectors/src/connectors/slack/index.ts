import { WebClient } from "@slack/web-api";

import {
  Connector,
  sequelize_conn,
  SlackConfiguration,
} from "@connectors/lib/models.js";
import { nango_client } from "@connectors/lib/nango_client.js";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";
export type NangoConnectionId = string;
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client.js";

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
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
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

      launchSlackSyncWorkflow(connector.id.toString());

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  return new Ok(res.value.id.toString());
}
