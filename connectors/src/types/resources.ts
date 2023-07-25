import { ConnectorProvider } from "./connector";

/**
 * This type represents the permission associated with a ConnectorResource. For now the only
 * permission we handle is read. but we could have more complex permissions in the future.
 */
const CONNECTOR_PERMISSIONS = ["read"] as const;
export type ConnectorPermission = (typeof CONNECTOR_PERMISSIONS)[number] | null;

const CONNECTOR_RESOURCE_TYPES = [
  "file",
  "folder",
  "database",
  "channel",
] as const;
export type ConnectorResourceType = (typeof CONNECTOR_RESOURCE_TYPES)[number];

/**
 * A ConnectorResource represents a connector related resource. As an example:
 * - Notion: Top-level pages (possibly manually added lower level ones)
 * - Github: repositories
 * - Slack: channels
 * - GoogleDrive: shared drive or sub-folders of shared drives.
 *
 * `internalId` and `parentInternalId` are internal opaque identifiers that should enable
 * reconstructing the tree structure of the resources.
 */
export type ConnectorResource = {
  provider: ConnectorProvider;
  internalId: string;
  parentInternalId: string | null;
  type: ConnectorResourceType;
  title: string;
  sourceUrl: string | null;
  expandable: boolean;
  permission: ConnectorPermission;
};
