import type { ConnectorProvider } from "@dust-tt/client";
import { assertNever } from "@dust-tt/client";
import type { CreationAttributes, Model, Transaction } from "sequelize";

import type { BigQueryConfigurationModel } from "@connectors/lib/models/bigquery";
import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import type { DiscordConfigurationModel } from "@connectors/lib/models/discord";
import type { GithubConnectorState } from "@connectors/lib/models/github";
import type { GongConfigurationModel } from "@connectors/lib/models/gong";
import type { GoogleDriveConfig } from "@connectors/lib/models/google_drive";
import type { IntercomWorkspaceModel } from "@connectors/lib/models/intercom";
import type { MicrosoftConfigurationModel } from "@connectors/lib/models/microsoft";
import type { MicrosoftBotConfigurationModel } from "@connectors/lib/models/microsoft_bot";
import type { NotionConnectorState } from "@connectors/lib/models/notion";
import type { SalesforceConfigurationModel } from "@connectors/lib/models/salesforce";
import type { SlackConfigurationModel } from "@connectors/lib/models/slack";
import type { SnowflakeConfigurationModel } from "@connectors/lib/models/snowflake";
import type { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import type { ZendeskConfigurationModel } from "@connectors/lib/models/zendesk";
import { BigQueryConnectorStrategy } from "@connectors/resources/connector/bigquery";
import { ConfluenceConnectorStrategy } from "@connectors/resources/connector/confluence";
import { DiscordConnectorStrategy } from "@connectors/resources/connector/discord";
import { GithubConnectorStrategy } from "@connectors/resources/connector/github";
import { GongConnectorStrategy } from "@connectors/resources/connector/gong";
import { GoogleDriveConnectorStrategy } from "@connectors/resources/connector/google_drive";
import { IntercomConnectorStrategy } from "@connectors/resources/connector/intercom";
import { MicrosoftConnectorStrategy } from "@connectors/resources/connector/microsoft";
import { MicrosoftBotConnectorStrategy } from "@connectors/resources/connector/microsoft_bot";
import { NotionConnectorStrategy } from "@connectors/resources/connector/notion";
import { SalesforceConnectorStrategy } from "@connectors/resources/connector/salesforce";
import { SlackConnectorStrategy } from "@connectors/resources/connector/slack";
import { SnowflakeConnectorStrategy } from "@connectors/resources/connector/snowflake";
import { WebCrawlerStrategy } from "@connectors/resources/connector/webcrawler";
import { ZendeskConnectorStrategy } from "@connectors/resources/connector/zendesk";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  SlackConfigurationType,
  WebCrawlerConfigurationType,
} from "@connectors/types";
import type { ModelId } from "@connectors/types";

import type { BaseResource } from "../base_resource";

export type WithCreationAttributes<T extends Model> = CreationAttributes<T>;

// ConnectorProvider to Configuration Model mapping used to define the type of the
// ConfigurationResource.

export interface ConnectorProviderModelM {
  confluence: ConfluenceConfiguration;
  discord_bot: DiscordConfigurationModel;
  github: GithubConnectorState;
  google_drive: GoogleDriveConfig;
  intercom: IntercomWorkspaceModel;
  microsoft: MicrosoftConfigurationModel;
  microsoft_bot: MicrosoftBotConfigurationModel;
  notion: NotionConnectorState;
  slack: SlackConfigurationModel;
  slack_bot: SlackConfigurationModel;
  webcrawler: WebCrawlerConfigurationModel;
  snowflake: SnowflakeConfigurationModel;
  zendesk: ZendeskConfigurationModel;
  bigquery: BigQueryConfigurationModel;
  salesforce: SalesforceConfigurationModel;
  gong: GongConfigurationModel;
}

export type ConnectorProviderModelMapping = {
  [K in keyof ConnectorProviderModelM]: WithCreationAttributes<
    ConnectorProviderModelM[K]
  >;
};

export type ConnectorProviderBlob =
  ConnectorProviderModelMapping[keyof ConnectorProviderModelMapping];

export type ConnectorProviderModelResourceMapping = {
  [K in keyof ConnectorProviderModelM]: BaseResource<
    ConnectorProviderModelM[K]
  >;
};

export type ConnectorProviderConfigurationResource =
  ConnectorProviderModelResourceMapping[keyof ConnectorProviderModelResourceMapping];

// ConnectorProvider to ConfigurationType mapping used to define the type of the toJSON method of
// the ConnectorProviderStrategy.

export interface ConnectorProviderConfigurationTypeM {
  confluence: null;
  discord_bot: null;
  github: null;
  google_drive: null;
  intercom: null;
  microsoft: null;
  microsoft_bot: null;
  notion: null;
  snowflake: null;
  slack: SlackConfigurationType;
  slack_bot: SlackConfigurationType;
  webcrawler: WebCrawlerConfigurationType;
  zendesk: null;
  bigquery: null;
  salesforce: null;
  gong: null;
}

export type ConnectorProviderConfigurationTypeMapping = {
  [K in keyof ConnectorProviderConfigurationTypeM]: ConnectorProviderConfigurationTypeM[K];
};

export type ConnectorProviderConfigurationType =
  ConnectorProviderConfigurationTypeMapping[keyof ConnectorProviderConfigurationTypeMapping];

export interface ConnectorProviderStrategy<
  // TODO(salesforce): implement this
  T extends ConnectorProvider,
> {
  delete(connector: ConnectorResource, transaction: Transaction): Promise<void>;

  makeNew(
    connectorId: ModelId,
    blob: ConnectorProviderModelMapping[T],
    transaction: Transaction
  ): Promise<ConnectorProviderConfigurationResource | null>;

  fetchConfigurationsbyConnectorIds(connectorIds: ModelId[]): Promise<{
    [connectorId: ModelId]: ConnectorProviderConfigurationResource;
  }>;

  configurationJSON(
    configuration: ConnectorProviderModelResourceMapping[T]
  ): ConnectorProviderConfigurationType;
}

export function getConnectorProviderStrategy(
  type: ConnectorProvider
): ConnectorProviderStrategy<ConnectorProvider> {
  switch (type) {
    case "confluence":
      return new ConfluenceConnectorStrategy();

    case "discord_bot":
      return new DiscordConnectorStrategy();

    case "github":
      return new GithubConnectorStrategy();

    case "google_drive":
      return new GoogleDriveConnectorStrategy();

    case "intercom":
      return new IntercomConnectorStrategy();

    case "microsoft":
      return new MicrosoftConnectorStrategy();

    case "microsoft_bot":
      return new MicrosoftBotConnectorStrategy();

    case "notion":
      return new NotionConnectorStrategy();

    case "slack":
      return new SlackConnectorStrategy();

    case "slack_bot":
      return new SlackConnectorStrategy();

    case "webcrawler":
      return new WebCrawlerStrategy();

    case "snowflake":
      return new SnowflakeConnectorStrategy();

    case "zendesk":
      return new ZendeskConnectorStrategy();

    case "bigquery":
      return new BigQueryConnectorStrategy();

    case "salesforce":
      return new SalesforceConnectorStrategy();

    case "gong":
      return new GongConnectorStrategy();

    default:
      assertNever(type);
  }
}
