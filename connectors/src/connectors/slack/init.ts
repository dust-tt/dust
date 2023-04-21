import { Connector, SlackConfiguration, sequelize_conn } from "@app/lib/models";
import { Err, Ok, Result } from "@app/lib/result";
import { Nango } from "@nangohq/node";
import { WebClient } from "@slack/web-api";
import { DataSourceConfig } from "@app/types/data_source_config";
export type NangoConnectionId = string;

const { NANGO_SECRET_KEY, NANGO_SLACK_CONNECTOR_ID } = process.env;

export async function createSlackConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: NangoConnectionId
): Promise<Result<void, Error>> {
  await sequelize_conn.transaction(
    async (t): Promise<Result<[Connector, SlackConfiguration], Error>> => {
      if (!NANGO_SECRET_KEY) {
        throw new Error("NANGO_SECRET_KEY is not defined");
      }
      if (!NANGO_SLACK_CONNECTOR_ID) {
        throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
      }
      const nango = new Nango({ secretKey: NANGO_SECRET_KEY });
      const slackAccessToken = await nango.getToken(
        NANGO_SLACK_CONNECTOR_ID,
        nangoConnectionId
      );
      const client = new WebClient(slackAccessToken);

      const teamInfo = await client.team.info();
      if (teamInfo.ok !== true) {
        return new Err(
          new Error(
            `Could not get slack team info. Error message: ${teamInfo.error}`
          )
        );
      }
      if (!teamInfo.team?.id) {
        return new Err(
          new Error(
            `Could not get slack team id. Error message: ${teamInfo.error}`
          )
        );
      }

      const connector = await Connector.create(
        {
          type: "slack",
          nangoConnectionId,
          workspaceAPIKey: dataSourceConfig.systemAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
        },
        { transaction: t }
      );

      const slackConfig = await SlackConfiguration.create(
        {
          slackTeamId: teamInfo.team.id,
          connectorId: connector.id,
        },
        { transaction: t }
      );

      return new Ok([connector, slackConfig]);
    }
  );

  return new Ok(undefined);
}
