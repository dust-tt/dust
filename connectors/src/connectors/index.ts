import type { ConnectorProvider, Result } from "@dust-tt/client";
import { assertNever } from "@dust-tt/client";

import { BigQueryConnectorManager } from "@connectors/connectors/bigquery";
import { ConfluenceConnectorManager } from "@connectors/connectors/confluence";
import { DiscordBotConnectorManager } from "@connectors/connectors/discord_bot";
import { GithubConnectorManager } from "@connectors/connectors/github";
import { GongConnectorManager } from "@connectors/connectors/gong";
import { GoogleDriveConnectorManager } from "@connectors/connectors/google_drive";
import { IntercomConnectorManager } from "@connectors/connectors/intercom";
import type {
  ConnectorManagerError,
  CreateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { MicrosoftConnectorManager } from "@connectors/connectors/microsoft";
import { NotionConnectorManager } from "@connectors/connectors/notion";
import { SalesforceConnectorManager } from "@connectors/connectors/salesforce";
import { SlackConnectorManager } from "@connectors/connectors/slack";
import { SlackBotConnectorManager } from "@connectors/connectors/slack_bot";
import { SnowflakeConnectorManager } from "@connectors/connectors/snowflake";
import { WebcrawlerConnectorManager } from "@connectors/connectors/webcrawler";
import { ZendeskConnectorManager } from "@connectors/connectors/zendesk";
import type {
  DiscordBotConfigurationType,
  SlackConfigurationType,
  WebCrawlerConfiguration,
} from "@connectors/types";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";

type ConnectorManager =
  | NotionConnectorManager
  | ConfluenceConnectorManager
  | WebcrawlerConnectorManager
  | MicrosoftConnectorManager
  | SlackConnectorManager
  | IntercomConnectorManager
  | GithubConnectorManager
  | GoogleDriveConnectorManager
  | SnowflakeConnectorManager;

export function getConnectorManager({
  connectorProvider,
  connectorId,
}: {
  connectorProvider: ConnectorProvider;
  connectorId: ModelId;
}): ConnectorManager {
  switch (connectorProvider) {
    case "confluence":
      return new ConfluenceConnectorManager(connectorId);
    case "github":
      return new GithubConnectorManager(connectorId);
    case "google_drive":
      return new GoogleDriveConnectorManager(connectorId);
    case "intercom":
      return new IntercomConnectorManager(connectorId);
    case "microsoft":
      return new MicrosoftConnectorManager(connectorId);
    case "notion":
      return new NotionConnectorManager(connectorId);
    case "slack":
      return new SlackConnectorManager(connectorId);
    case "slack_bot":
      return new SlackBotConnectorManager(connectorId);
    case "webcrawler":
      return new WebcrawlerConnectorManager(connectorId);
    case "snowflake":
      return new SnowflakeConnectorManager(connectorId);
    case "zendesk":
      return new ZendeskConnectorManager(connectorId);
    case "bigquery":
      return new BigQueryConnectorManager(connectorId);
    case "salesforce":
      return new SalesforceConnectorManager(connectorId);
    case "gong":
      return new GongConnectorManager(connectorId);
    case "discord_bot":
      return new DiscordBotConnectorManager(connectorId);
    default:
      assertNever(connectorProvider);
  }
}

export function createConnector({
  connectorProvider,
  params,
}:
  | {
      connectorProvider: Exclude<
        ConnectorProvider,
        "webcrawler" | "slack" | "slack_bot" | "discord_bot"
      >;
      params: {
        dataSourceConfig: DataSourceConfig;
        connectionId: string;
        configuration: null;
      };
    }
  | {
      connectorProvider: "webcrawler";
      params: {
        dataSourceConfig: DataSourceConfig;
        connectionId: string;
        configuration: WebCrawlerConfiguration;
      };
    }
  | {
      connectorProvider: "slack" | "slack_bot";
      params: {
        dataSourceConfig: DataSourceConfig;
        connectionId: string;
        configuration: SlackConfigurationType;
      };
    }
  | {
      connectorProvider: "discord_bot";
      params: {
        dataSourceConfig: DataSourceConfig;
        connectionId: string;
        configuration: DiscordBotConfigurationType;
      };
    }): Promise<
  Result<string, ConnectorManagerError<CreateConnectorErrorCode>>
> {
  switch (connectorProvider) {
    case "confluence":
      return ConfluenceConnectorManager.create(params);
    case "github":
      return GithubConnectorManager.create(params);
    case "google_drive":
      return GoogleDriveConnectorManager.create(params);
    case "intercom":
      return IntercomConnectorManager.create(params);
    case "microsoft":
      return MicrosoftConnectorManager.create(params);
    case "notion":
      return NotionConnectorManager.create(params);
    case "slack":
      return SlackConnectorManager.create(params);
    case "slack_bot":
      return SlackBotConnectorManager.create(params);
    case "webcrawler":
      return WebcrawlerConnectorManager.create(params);
    case "snowflake":
      return SnowflakeConnectorManager.create(params);
    case "zendesk":
      return ZendeskConnectorManager.create(params);
    case "bigquery":
      return BigQueryConnectorManager.create(params);
    case "salesforce":
      return SalesforceConnectorManager.create(params);
    case "gong":
      return GongConnectorManager.create(params);
    case "discord_bot":
      return DiscordBotConnectorManager.create(params);
    default:
      assertNever(connectorProvider);
  }
}
