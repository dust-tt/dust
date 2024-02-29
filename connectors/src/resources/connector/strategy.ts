import type { ConnectorProvider } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { CreationAttributes, Model, Transaction } from "sequelize";

import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import type { GithubConnectorState } from "@connectors/lib/models/github";
import type { GoogleDriveConfig } from "@connectors/lib/models/google_drive";
import type { IntercomWorkspace } from "@connectors/lib/models/intercom";
import type { NotionConnectorState } from "@connectors/lib/models/notion";
import type { SlackConfiguration } from "@connectors/lib/models/slack";
import type { WebCrawlerConfiguration } from "@connectors/lib/models/webcrawler";
import { ConfluenceConnectorStrategy } from "@connectors/resources/connector/confluence";
import { GithubConnectorStrategy } from "@connectors/resources/connector/github";
import { GoogleDriveConnectorStrategy } from "@connectors/resources/connector/google_drive";
import { IntercomConnectorStrategy } from "@connectors/resources/connector/intercom";
import { NotionConnectorStrategy } from "@connectors/resources/connector/notion";
import { SlackConnectorStrategy } from "@connectors/resources/connector/slack";
import { WebCrawlerStrategy } from "@connectors/resources/connector/webcrawler";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export type WithCreationAttributes<T extends Model> = CreationAttributes<T>;

export interface ConnectorProviderModelM {
  confluence: ConfluenceConfiguration;
  github: GithubConnectorState;
  google_drive: GoogleDriveConfig;
  intercom: IntercomWorkspace;
  notion: NotionConnectorState;
  slack: SlackConfiguration;
  webcrawler: WebCrawlerConfiguration;
}

export type ConnectorProviderModelMapping = {
  [K in keyof ConnectorProviderModelM]: WithCreationAttributes<
    ConnectorProviderModelM[K]
  >;
};

export type ConnectorProviderBlob =
  ConnectorProviderModelMapping[keyof ConnectorProviderModelMapping];

export interface ConnectorProviderStrategy {
  delete(connector: ConnectorResource, transaction: Transaction): Promise<void>;

  makeNew(
    connector: ConnectorResource,
    blob: ConnectorProviderBlob,
    transaction: Transaction
  ): Promise<void>;
}

export function getConnectorProviderStrategy(type: ConnectorProvider) {
  switch (type) {
    case "confluence":
      return new ConfluenceConnectorStrategy();

    case "github":
      return new GithubConnectorStrategy();

    case "google_drive":
      return new GoogleDriveConnectorStrategy();

    case "intercom":
      return new IntercomConnectorStrategy();

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
