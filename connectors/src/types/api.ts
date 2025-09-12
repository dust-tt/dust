import type { ConnectorProvider } from "@dust-tt/client";

import type { ConnectorConfiguration } from "./configuration";
import type { ContentNodeType } from "./content_nodes";

const CONNECTORS_API_ERROR_TYPES = [
  "authorization_error",
  "not_found",
  "internal_server_error",
  "unexpected_error_format",
  "unexpected_response_format",
  "unexpected_network_error",
  "unknown_connector_provider",
  "invalid_request_error",
  "connector_not_found",
  "connector_configuration_not_found",
  "connector_update_error",
  "connector_update_unauthorized",
  "connector_oauth_target_mismatch",
  "connector_oauth_user_missing_rights",
  "connector_oauth_error",
  "connector_authorization_error",
  "slack_channel_not_found",
  "connector_rate_limit_error",
  "slack_configuration_not_found",
  "google_drive_webhook_not_found",
  "connector_operation_in_progress",
] as const;
export type ConnectorsAPIErrorType =
  (typeof CONNECTORS_API_ERROR_TYPES)[number];

export type ConnectorsAPIError = {
  type: ConnectorsAPIErrorType;
  message: string;
};

export type ConnectorsAPIErrorResponse = {
  error: ConnectorsAPIError;
};

export type ConnectorsAPIErrorWithStatusCode = {
  api_error: ConnectorsAPIError;
  status_code: number;
};

export type WithConnectorsAPIErrorReponse<T> = T | ConnectorsAPIErrorResponse;

export function isConnectorsAPIError(obj: unknown): obj is ConnectorsAPIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string" &&
    "type" in obj &&
    typeof obj.type === "string" &&
    CONNECTORS_API_ERROR_TYPES.includes(obj.type as ConnectorsAPIErrorType)
  );
}

export type ConnectorSyncStatus = "succeeded" | "failed";
const CONNECTORS_ERROR_TYPES = [
  "oauth_token_revoked",
  "workspace_quota_exceeded",
  "third_party_internal_error",
  "webcrawling_error",
  "webcrawling_error_empty_content",
  "webcrawling_error_content_too_large",
  "webcrawling_error_blocked",
  "webcrawling_synchronization_limit_reached",
  "remote_database_connection_not_readonly",
  "remote_database_network_error",
] as const;

export type ConnectorErrorType = (typeof CONNECTORS_ERROR_TYPES)[number];
export function isConnectorError(val: string): val is ConnectorErrorType {
  return (CONNECTORS_ERROR_TYPES as unknown as string[]).includes(val);
}

export type ConnectorType = {
  id: string;
  type: ConnectorProvider;
  workspaceId: string;
  dataSourceId: string;
  connectionId: string;
  useProxy: boolean;
  lastSyncStatus?: ConnectorSyncStatus;
  lastSyncStartTime?: number;
  lastSyncFinishTime?: number;
  lastSyncSuccessfulTime?: number;
  firstSuccessfulSyncTime?: number;
  firstSyncProgress?: string;
  errorType?: ConnectorErrorType;
  configuration: ConnectorConfiguration;
  pausedAt?: number;
  updatedAt: number;
};

/**
 * This type represents the permission associated with a ContentNode. For now the only
 * permission we handle is read. but we could have more complex permissions in the future.
 */
export type ConnectorPermission = "read" | "write" | "read_write" | "none";
// currently used for Slack, for which channels can be public or private
export type ProviderVisibility = "public" | "private";

/**
 * A ContentNode represents a connector related node. As an example:
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
 * used both in the parents field management code and the connectors node code.
 *
 * A specific situation for the Microsoft connector leads us to not use the
 * externally provided id (although it exists and is unique), but to compute our
 * own. This is because the Microsoft API does not allow to query a document or
 * list its children using its id alone. We compute an internal id that contains all
 * information. More details here:
 * https://www.notion.so/dust-tt/Design-Doc-Microsoft-ids-parents-c27726652aae45abafaac587b971a41d?pvs=4
 */
export interface ContentNode {
  expandable: boolean;
  internalId: string;
  lastUpdatedAt: number | null;
  mimeType: string;
  // The direct parent ID of this content node
  parentInternalId: string | null;
  permission: ConnectorPermission;
  preventSelection?: boolean;
  providerVisibility?: ProviderVisibility;
  sourceUrl: string | null;
  title: string;
  type: ContentNodeType;
}

export interface ContentNodeWithParent extends ContentNode {
  parentInternalIds: string[] | null;
  parentTitle?: string;
}

export function isScheduleAlreadyRunning(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "ScheduleAlreadyRunning"
  );
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(errorToString(error));
}
