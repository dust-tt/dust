import type { ConnectorProvider, ModelId } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { CreationAttributes, Model, Transaction } from "sequelize";

import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import type { GithubConnectorState } from "@connectors/lib/models/github";
import type { GoogleDriveConfig } from "@connectors/lib/models/google_drive";
import type { IntercomWorkspace } from "@connectors/lib/models/intercom";
import type { MicrosoftConfigurationModel } from "@connectors/lib/models/microsoft";
import type { NotionConnectorState } from "@connectors/lib/models/notion";
import type { SlackConfigurationModel } from "@connectors/lib/models/slack";
import type { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import { ConfluenceConnectorStrategy } from "@connectors/resources/connector/confluence";
import { GithubConnectorStrategy } from "@connectors/resources/connector/github";
import { GoogleDriveConnectorStrategy } from "@connectors/resources/connector/google_drive";
import { IntercomConnectorStrategy } from "@connectors/resources/connector/intercom";
import { MicrosoftConnectorStrategy } from "@connectors/resources/connector/microsoft";
import { NotionConnectorStrategy } from "@connectors/resources/connector/notion";
import { SlackConnectorStrategy } from "@connectors/resources/connector/slack";
import { WebCrawlerStrategy } from "@connectors/resources/connector/webcrawler";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

import type { BaseResource } from "../base_resource";

export type WithCreationAttributes<T extends Model> = CreationAttributes<T>;

export interface ConnectorProviderModelM {
  confluence: ConfluenceConfiguration;
  github: GithubConnectorState;
  google_drive: GoogleDriveConfig;
  intercom: IntercomWorkspace;
  microsoft: MicrosoftConfigurationModel;
  notion: NotionConnectorState;
  slack: SlackConfigurationModel;
  webcrawler: WebCrawlerConfigurationModel;
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

    default:
      assertNever(type);
  }
}
