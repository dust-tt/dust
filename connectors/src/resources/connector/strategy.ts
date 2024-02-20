import type { ConnectorProvider } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import { ConfluenceConnectorStrategy } from "@connectors/resources/connector/confluence";
import { GithubConnectorStrategy } from "@connectors/resources/connector/github";
import { GoogleDriveConnectorStrategy } from "@connectors/resources/connector/google_drive";
import { IntercomConnectorStrategy } from "@connectors/resources/connector/intercom";
import { NotionConnectorStrategy } from "@connectors/resources/connector/notion";
import { SlackConnectorStrategy } from "@connectors/resources/connector/slack";
import { WebCrawlerStrategy } from "@connectors/resources/connector/webcrawler";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export interface ConnectorProviderStrategy {
  // TODO(2024-02-20 flav) Add more methods.
  delete(connector: ConnectorResource, transaction: Transaction): Promise<void>;
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
