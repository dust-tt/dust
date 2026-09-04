import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { ManagedPermissionsQuery } from "@app/types/api/data_sources/managed_permissions";
import type { ContentNode } from "@app/types/connectors/connectors_api";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ManagedPermissionsResponse = {
  resources: ContentNode[];
};

type ManagedPermissionsError =
  | { type: "connector_rate_limit" }
  | { type: "connector_authorization_error" }
  | { type: "connector_oauth_user_must_be_admin"; message: string }
  | { type: "internal_error" };

export async function getManagedDataSourcePermissions(
  connectorId: string,
  query: ManagedPermissionsQuery
): Promise<Result<ManagedPermissionsResponse, ManagedPermissionsError>> {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const permissionsRes = await connectorsAPI.getConnectorPermissions({
    connectorId,
    parentId: query.parentId,
    filterPermission: query.filterPermission,
    viewType: query.viewType,
  });

  if (permissionsRes.isErr()) {
    if (permissionsRes.error.type === "connector_rate_limit_error") {
      return new Err({ type: "connector_rate_limit" });
    }
    if (permissionsRes.error.type === "connector_authorization_error") {
      return new Err({ type: "connector_authorization_error" });
    }
    if (permissionsRes.error.type === "connector_oauth_user_must_be_admin") {
      return new Err({
        type: "connector_oauth_user_must_be_admin",
        message: permissionsRes.error.message,
      });
    }
    return new Err({ type: "internal_error" });
  }

  return new Ok({ resources: permissionsRes.value.resources });
}
