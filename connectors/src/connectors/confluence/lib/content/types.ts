import type { SpaceBlob } from "@connectors/connectors/confluence/temporal/activities";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types";

export interface BaseConfluenceCheckAndUpsertSingleEntityActivityInput {
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  forceUpsert: boolean;
  isBatchSync: boolean;
  space: SpaceBlob;
  visitedAtMs: number;
}

/**
 * This type represents the ID that should be passed as parentId to a content node to hide it from
 * the UI. This behavior is typically used to hide content nodes whose position in the
 * ContentNodeTree cannot be resolved at time of upsertion.
 */
export const HiddenContentNodeParentId = "__hidden_syncing_content__";

export function makeConfluenceContentUrl({
  baseUrl,
  suffix,
}: {
  baseUrl: string;
  suffix: string;
}) {
  return `${baseUrl}/wiki${suffix}`;
}
