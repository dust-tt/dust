import type { ConnectorProvider } from "@dust-tt/types";

/**
 * This type represents the permission associated with a ConnectorResource. For now the only
 * permission we handle is read. but we could have more complex permissions in the future.
 */
export type ConnectorPermission = "read" | "write" | "read_write" | "none";

export type ConnectorResourceType = "file" | "folder" | "database" | "channel";

/**
 * A ConnectorResource represents a connector related resource. As an example:
 * - Notion: Top-level pages (possibly manually added lower level ones)
 * - Github: repositories
 * - Slack: channels
 * - GoogleDrive: shared drive or sub-folders of shared drives.
 *
 * `internalId` and `parentInternalId` are internal opaque identifiers that
 * should enable reconstructing the tree structure of the resources.
 *
 * Those ids must be aligned with those used in the "parents" field of data
 * sources documents, to enable search filter on documents based on their
 * parents, see the
 *
 * The convention to use for internal ids are to always use the externally
 * provided id when possible (e.g. Notion page id, Github repository id,
 * etc...). When not possible, such as for Github issues whose id is not
 * workspace-unique, a custom function to create a unique id is created, and
 * used both in the parents field management code and the connectors resource
 * code.
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
  dustDocumentId: string | null;
  lastUpdatedAt: number | null;
};
