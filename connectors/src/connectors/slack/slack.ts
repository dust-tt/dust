import { Connector, sequelize_conn, SlackConfiguration } from '../../lib/models';
import { Err, Ok, Result } from '../../lib/result';
import { DataSourceConfig } from '../../types/data_source_config';
import { WebClient } from '@slack/web-api';
import { Channel } from '@slack/web-api/dist/response/ConversationsListResponse';
import { nango_client } from '../../lib/nango';
export type NangoConnectionId = string;

const { NANGO_SLACK_CONNECTOR_ID } = process.env;

export async function createSlackConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: NangoConnectionId,
): Promise<Result<string, Error>> {
  const res = await sequelize_conn.transaction(async (t): Promise<Result<Connector, Error>> => {
    const nango = nango_client();
    if (!NANGO_SLACK_CONNECTOR_ID) {
      throw new Error('NANGO_SLACK_CONNECTOR_ID is not defined');
    }
    const slackAccessToken = await nango.getToken(NANGO_SLACK_CONNECTOR_ID, nangoConnectionId);
    const client = new WebClient(slackAccessToken);

    const teamInfo = await client.team.info();
    if (teamInfo.ok !== true) {
      return new Err(new Error(`Could not get slack team info. Error message: ${teamInfo.error}`));
    }
    if (!teamInfo.team?.id) {
      return new Err(new Error(`Could not get slack team id. Error message: ${teamInfo.error}`));
    }

    const connector = await Connector.create(
      {
        type: 'slack',
        nangoConnectionId,
        workspaceAPIKey: dataSourceConfig.APIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      { transaction: t },
    );

    await SlackConfiguration.create(
      {
        slackTeamId: teamInfo.team.id,
        connectorId: connector.id,
      },
      { transaction: t },
    );

    return new Ok(connector);
  });

  if (res.isErr()) {
    return res;
  }

  return new Ok(res.value.id.toString());
}

/**
 * Basic Slack API method created just to show case the interaction with Slack API through a
 * temporal Workflow in this node package.
 * @todo(aric)) Shoud be removed once we have another PR actually triggering a Temporal Workflow using this module.
 */
export async function getChannels(nangoConnectionId: string): Promise<Result<Channel[], Error>> {
  const nango = nango_client();
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error('NANGO_SLACK_CONNECTOR_ID is not defined');
  }
  const slackAccessToken = await nango.getToken(NANGO_SLACK_CONNECTOR_ID, nangoConnectionId);
  const client = new WebClient(slackAccessToken);
  const res = await client.conversations.list({
    types: 'public_channel,private_channel',
    limit: 1000,
  });
  if (res.ok !== true) {
    return new Err(new Error(`Could not get slack channels. Error message: ${res.error}`));
  }

  return new Ok(res.channels || []);
}
