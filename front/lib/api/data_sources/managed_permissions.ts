import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodeWithParent,
} from "@app/types/connectors/connectors_api";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { ContentNodesViewTypeCodec } from "@app/types/connectors/content_nodes";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export const ManagedPermissionsQuerySchema = z.object({
  parentId: z.string().optional(),
  filterPermission: z.enum(["read", "write"]).optional(),
  viewType: ContentNodesViewTypeCodec,
});

export type ManagedPermissionsQuery = z.infer<
  typeof ManagedPermissionsQuerySchema
>;

export type ManagedPermissionsResponse = {
  resources: ContentNode[];
};

export type ManagedPermissionsError =
  | { type: "connector_rate_limit" }
  | { type: "connector_authorization_error" }
  | { type: "internal_error" };

export type GetDataSourcePermissionsResponseBody<
  T extends ConnectorPermission = ConnectorPermission,
> = {
  resources: (T extends "read" ? ContentNodeWithParent : ContentNode)[];
};

export type SetDataSourcePermissionsResponseBody = {
  success: true;
};

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
    return new Err({ type: "internal_error" });
  }

  return new Ok({ resources: permissionsRes.value.resources });
}
