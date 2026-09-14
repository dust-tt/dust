import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { ConnectorProvider } from "@app/types/data_source";

// The bot connectors surfaced in the workspace "Messaging apps" governance section.
const BOT_CONNECTOR_PROVIDERS = [
  "slack_bot",
  "microsoft_bot",
  "discord_bot",
] as const satisfies readonly ConnectorProvider[];

export type PokeMessagingAppProvider = (typeof BOT_CONNECTOR_PROVIDERS)[number];

export type PokeMessagingApp = {
  provider: PokeMessagingAppProvider;
  // Whether the bot connector has been set up at all: without it the toggle cannot be turned on.
  isConnected: boolean;
  isBotEnabled: boolean;
  dataSourceId: string | null;
};

export type PokeGetMessagingApps = {
  messagingApps: PokeMessagingApp[];
};

export async function getPokeMessagingApps(
  auth: Authenticator
): Promise<PokeMessagingApp[]> {
  const [[slackBot], [microsoftBot], [discordBot]] = await Promise.all([
    DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
    DataSourceResource.listByConnectorProvider(auth, "microsoft_bot"),
    DataSourceResource.listByConnectorProvider(auth, "discord_bot"),
  ]);

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const dataSourceByProvider: Record<
    PokeMessagingAppProvider,
    DataSourceResource | undefined
  > = {
    slack_bot: slackBot,
    microsoft_bot: microsoftBot,
    discord_bot: discordBot,
  };

  // The `botEnabled` flag lives in the connectors service, one call per bot (at most three).
  return Promise.all(
    BOT_CONNECTOR_PROVIDERS.map(async (provider) => {
      const dataSource = dataSourceByProvider[provider];
      if (!dataSource?.connectorId) {
        return {
          provider,
          isConnected: false,
          isBotEnabled: false,
          dataSourceId: dataSource?.sId ?? null,
        };
      }

      const configRes = await connectorsAPI.getConnectorConfig(
        dataSource.connectorId,
        "botEnabled"
      );
      if (configRes.isErr()) {
        logger.error(
          { connectorId: dataSource.connectorId, error: configRes.error },
          "Failed to fetch botEnabled config for messaging app."
        );
      }

      return {
        provider,
        isConnected: true,
        isBotEnabled:
          configRes.isOk() && configRes.value.configValue === "true",
        dataSourceId: dataSource.sId,
      };
    })
  );
}
