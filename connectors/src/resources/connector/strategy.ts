import type {
  ConnectorProvider,
  ModelId,
  SlackConfigurationType,
  WebCrawlerConfigurationType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { CreationAttributes, Model, Transaction } from "sequelize";

import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import type { GithubConnectorState } from "@connectors/lib/models/github";
import type { GoogleDriveConfig } from "@connectors/lib/models/google_drive";
import type { IntercomWorkspace } from "@connectors/lib/models/intercom";
import type { MicrosoftConfigurationModel } from "@connectors/lib/models/microsoft";
import type { NotionConnectorState } from "@connectors/lib/models/notion";
import type { SlackConfigurationModel } from "@connectors/lib/models/slack";
import type { SnowflakeConfigurationModel } from "@connectors/lib/models/snowflake";
import type { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import { ConfluenceConnectorStrategy } from "@connectors/resources/connector/confluence";
import { GithubConnectorStrategy } from "@connectors/resources/connector/github";
import { GoogleDriveConnectorStrategy } from "@connectors/resources/connector/google_drive";
import { IntercomConnectorStrategy } from "@connectors/resources/connector/intercom";
import { MicrosoftConnectorStrategy } from "@connectors/resources/connector/microsoft";
import { NotionConnectorStrategy } from "@connectors/resources/connector/notion";
import { SlackConnectorStrategy } from "@connectors/resources/connector/slack";
import { SnowflakeConnectorStrategy } from "@connectors/resources/connector/snowflake";
import { WebCrawlerStrategy } from "@connectors/resources/connector/webcrawler";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

import type { BaseResource } from "../base_resource";

export type WithCreationAttributes<T extends Model> = CreationAttributes<T>;

// ConnectorProvider to Configuration Model mapping used to define the type of the
// ConfigurationResource.

export interface ConnectorProviderModelM {
  confluence: ConfluenceConfiguration;
  github: GithubConnectorState;
  google_drive: GoogleDriveConfig;
  intercom: IntercomWorkspace;
  microsoft: MicrosoftConfigurationModel;
  notion: NotionConnectorState;
  slack: SlackConfigurationModel;
  webcrawler: WebCrawlerConfigurationModel;
  snowflake: SnowflakeConfigurationModel;
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
  github: null;
  google_drive: null;
  intercom: null;
  microsoft: null;
  notion: null;
  snowflake: null;
  slack: SlackConfigurationType;
  webcrawler: WebCrawlerConfigurationType;
}

export type ConnectorProviderConfigurationTypeMapping = {
  [K in keyof ConnectorProviderConfigurationTypeM]: ConnectorProviderConfigurationTypeM[K];
};

export type ConnectorProviderConfigurationType =
  ConnectorProviderConfigurationTypeMapping[keyof ConnectorProviderConfigurationTypeMapping];

export interface ConnectorProviderStrategy<T extends ConnectorProvider> {
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

    case "github":
      return new GithubConnectorStrategy();

    case "google_drive":
      return new GoogleDriveConnectorStrategy();

    case "intercom":
      return new IntercomConnectorStrategy();

    case "microsoft":
      return new MicrosoftConnectorStrategy();

    case "notion":
      return new NotionConnectorStrategy();

    case "slack":
      return new SlackConnectorStrategy();

    case "webcrawler":
      return new WebCrawlerStrategy();

    case "snowflake":
      return new SnowflakeConnectorStrategy();

    default:
      assertNever(type);
  }
}
