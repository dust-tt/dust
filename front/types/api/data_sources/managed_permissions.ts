import type {
  ConnectorPermission,
  ContentNode,
  ContentNodeWithParent,
} from "@app/types/connectors/connectors_api";
import { ContentNodesViewTypeCodec } from "@app/types/connectors/content_nodes";
import { z } from "zod";

export const ManagedPermissionsQuerySchema = z.object({
  parentId: z.string().optional(),
  filterPermission: z.enum(["read", "write"]).optional(),
  viewType: ContentNodesViewTypeCodec,
});

export type ManagedPermissionsQuery = z.infer<
  typeof ManagedPermissionsQuerySchema
>;

export type GetDataSourcePermissionsResponseBody<
  T extends ConnectorPermission = ConnectorPermission,
> = {
  resources: (T extends "read" ? ContentNodeWithParent : ContentNode)[];
};

export type SetDataSourcePermissionsResponseBody = {
  success: true;
};
