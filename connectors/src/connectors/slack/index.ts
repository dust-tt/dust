import { WebClient } from "@slack/web-api";
import { Transaction } from "sequelize";

import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client.js";
import {
  Connector,
  ModelId,
  sequelize_conn,
  SlackConfiguration,
  SlackMessages,
} from "@connectors/lib/models.js";
import {
  nango_client,
  nangoDeleteConnection,
} from "@connectors/lib/nango_client.js";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";
import { NangoConnectionId } from "@connectors/types/nango_connection_id";
import { ConnectorResource } from "@connectors/types/resources";

import {
  getAccessToken,
  getChannels,
  getSlackClient,
} from "./temporal/activities";

const { NANGO_SLACK_CONNECTOR_ID, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } =
  process.env;

export async function createSlackConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const nangoConnectionId = connectionId;

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
          connectionId: nangoConnectionId,
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
          botEnabled: false,
        },
        { transaction: t }
      );

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  const launchRes = await launchSlackSyncWorkflow(
    res.value.id.toString(),
    null
  );
  if (launchRes.isErr()) {
    return new Err(launchRes.error);
  }

  return new Ok(res.value.id.toString());
}

export async function cleanupSlackConnector(
  connectorId: string,
  transaction: Transaction
): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId, {
    transaction: transaction,
  });
  if (!connector) {
    return new Err(
      new Error(`Could not find connector with id ${connectorId}`)
    );
  }

  const configuration = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
    transaction: transaction,
  });
  if (!configuration) {
    return new Err(
      new Error(`Could not find configuration for connector id ${connectorId}`)
    );
  }

  const configurations = await SlackConfiguration.findAll({
    where: {
      slackTeamId: configuration.slackTeamId,
    },
    transaction: transaction,
  });

  // We deactivate our connections only if we are the only live slack connection for this team.
  if (configurations.length == 1) {
    if (!NANGO_SLACK_CONNECTOR_ID) {
      return new Err(new Error("NANGO_SLACK_CONNECTOR_ID is not defined"));
    }
    if (!SLACK_CLIENT_ID) {
      return new Err(new Error("SLACK_CLIENT_ID is not defined"));
    }
    if (!SLACK_CLIENT_SECRET) {
      return new Err(new Error("SLACK_CLIENT_SECRET is not defined"));
    }
    const accessToken = await getAccessToken(connector.connectionId);
    const slackClient = getSlackClient(accessToken);
    const deleteRes = await slackClient.apps.uninstall({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
    });
    if (!deleteRes.ok) {
      return new Err(
        new Error(
          `Could not uninstall the Slack app from the user's workspace. Error: ${deleteRes.error}`
        )
      );
    }

    const nangoRes = await nangoDeleteConnection(
      connector.connectionId,
      NANGO_SLACK_CONNECTOR_ID
    );
    if (nangoRes.isErr()) {
      return nangoRes;
    }
    logger.info(
      { slackTeamId: configuration.slackTeamId },
      `Deactivated the Slack app`
    );
  } else {
    logger.info(
      {
        slackTeamId: configuration.slackTeamId,
        activeConfigurations: configurations.length - 1,
      },
      `Skipping deactivation of the Slack app`
    );
  }

  await SlackMessages.destroy({
    where: {
      connectorId: connectorId,
    },
    transaction: transaction,
  });
  await SlackConfiguration.destroy({
    where: {
      connectorId: connectorId,
    },
    transaction: transaction,
  });

  return new Ok(undefined);
}

export async function retrieveSlackConnectorPermissions(
  connectorId: ModelId,
  parentInternalId: string | null
): Promise<Result<ConnectorResource[], Error>> {
  if (parentInternalId) {
    return new Err(
      new Error(
        "Slack connector does not support permission retrieval with `parentInternalId`"
      )
    );
  }

  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }

  const accessToken = await getAccessToken(c.connectionId);
  const channels = await getChannels(accessToken);

  const resources: ConnectorResource[] = channels
    .filter((ch) => !!ch.id && !!ch.name)
    .map((ch) => {
      return {
        provider: "slack",
        internalId: ch.id || "",
        parentInternalId: null,
        title: `#${ch.name || ""}`,
        sourceUrl: `https://app.slack.com/client/${ch.context_team_id}/${ch.id}`,
        permission: "read",
      };
    });

  return new Ok(resources);
}
