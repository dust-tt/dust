import { ConnectorProvider } from "./connector";

/**
 * This type represents the permission associated with a ConnectorResource. For now the only
 * permission we handle is read. but we could have more complex permissions in the future.
 */
export type ConnectorPermission = "read" | null;

/**
 * A ConnectorResource represents a connector related resource. As an example:
 * - Notion: Top-level pages (possibly manually added lower level ones)
 * - Github: repositories
 * - Slack: channels
 * - GoogleDrive: shared drive or sub-folders of shared drives.
 *
 * `internalId` and `parentInternalId` are internal opaque identifiers that should enable
 * reconstrcuting the tree structure of the resources.
 */
export type ConnectorResource = {
  provider: ConnectorProvider;
  internalId: string;
  parentInternalId: string | null;
  title: string;
  sourceUrl: string | null;
  permission: ConnectorPermission;
};
