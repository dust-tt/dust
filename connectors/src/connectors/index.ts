import type {
  ConnectorProvider,
  ModelId,
  Result,
  SlackConfiguration,
  WebCrawlerConfiguration,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import { ConfluenceConnectorManager } from "@connectors/connectors/confluence";
import { GithubConnectorManager } from "@connectors/connectors/github";
import { GoogleDriveConnectorManager } from "@connectors/connectors/google_drive";
import { IntercomConnectorManager } from "@connectors/connectors/intercom";
import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { MicrosoftConnectorManager } from "@connectors/connectors/microsoft";
import { NotionConnectorManager } from "@connectors/connectors/notion";
import { SlackConnectorManager } from "@connectors/connectors/slack";
import { SnowflakeConnectorManager } from "@connectors/connectors/snowflake";
import { WebcrawlerConnectorManager } from "@connectors/connectors/webcrawler";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

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
    case "webcrawler":
      return new WebcrawlerConnectorManager(connectorId);
    case "snowflake":
      return new SnowflakeConnectorManager(connectorId);
    default:
      assertNever(connectorProvider);
  }
}

export function createConnector({
  connectorProvider,
  params,
}:
  | {
      connectorProvider: Exclude<ConnectorProvider, "webcrawler" | "slack">;
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
      connectorProvider: "slack";
      params: {
        dataSourceConfig: DataSourceConfig;
        connectionId: string;
        configuration: SlackConfiguration;
      };
    }): Promise<Result<string, ConnectorManagerError>> {
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
    case "webcrawler":
      return WebcrawlerConnectorManager.create(params);
    case "snowflake":
      return SnowflakeConnectorManager.create(params);
    default:
      assertNever(connectorProvider);
  }
}
