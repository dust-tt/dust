import { Hono } from "hono";
import { z } from "zod";

import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { isValidContentNodesViewType } from "@app/types/connectors/content_nodes";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { validate } from "@front-api/middleware/validator";

const SetConnectorPermissionsRequestBodySchema = z.object({
  resources: z.array(
    z.object({
      internal_id: z.string(),
      permission: z.enum(["none", "read", "write", "read_write"]),
    })
  ),
});

// Mounted at /api/w/:wId/data_sources/:dsId/managed/permissions.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      },
      404
    );
  }
  if (!dataSource.connectorId) {
    return c.json(
      {
        error: {
          type: "data_source_not_managed",
          message: "The data source you requested is not managed.",
        },
      },
      400
    );
  }
  if (!dataSource.canAdministrate(auth)) {
    return c.json(
      {
        error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `admins` for the current workspace can administrate a data source.",
        },
      },
      403
    );
  }

  const parentIdParam = c.req.query("parentId");
  const parentId =
    typeof parentIdParam === "string" ? parentIdParam : undefined;

  const filterPermissionParam = c.req.query("filterPermission");
  let filterPermission: "read" | "write" | undefined;
  if (filterPermissionParam === "read") {
    filterPermission = "read";
  } else if (filterPermissionParam === "write") {
    filterPermission = "write";
  }

  switch (filterPermission) {
    case "read":
      // We let users get the read permissions of a connector.
      // `read` is used for data source selection when creating personal assistants.
      break;
    case "write":
      // We let builders get the write permissions of a connector.
      // `write` is used for selection of default slack channel in the workspace agent builder.
      if (!auth.isBuilder()) {
        return c.json(
          {
            error: {
              type: "data_source_auth_error",
              message:
                "Only builders of the current workspace can view 'write' permissions of a data source.",
            },
          },
          403
        );
      }
      break;
    case undefined:
      // Only admins can browse "all" the resources of a connector.
      if (!auth.isAdmin()) {
        return c.json(
          {
            error: {
              type: "data_source_auth_error",
              message:
                "Only admins of the current workspace can view all permissions of a data source.",
            },
          },
          403
        );
      }
      break;
    default:
      assertNever(filterPermission);
  }

  const viewType = c.req.query("viewType");
  if (!viewType || !isValidContentNodesViewType(viewType)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Invalid viewType. Required: table | document | all",
        },
      },
      400
    );
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const permissionsRes = await connectorsAPI.getConnectorPermissions({
    connectorId: dataSource.connectorId,
    parentId,
    filterPermission,
    viewType,
  });

  if (permissionsRes.isErr()) {
    if (permissionsRes.error.type === "connector_rate_limit_error") {
      return c.json(
        {
          error: {
            type: "rate_limit_error",
            message:
              "Rate limit error while retrieving the data source permissions",
          },
        },
        429
      );
    }
    if (permissionsRes.error.type === "connector_authorization_error") {
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message:
              "Authorization error while retrieving the data source permissions.",
          },
        },
        401
      );
    }
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message:
            "An error occurred while retrieving the data source permissions.",
        },
      },
      500
    );
  }

  return c.json({ resources: permissionsRes.value.resources });
});

app.post(
  "/",
  validate("json", SetConnectorPermissionsRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const dsId = c.req.param("dsId") ?? "";

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return c.json(
        {
          error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        },
        404
      );
    }
    if (!dataSource.connectorId) {
      return c.json(
        {
          error: {
            type: "data_source_not_managed",
            message: "The data source you requested is not managed.",
          },
        },
        400
      );
    }
    if (!dataSource.canAdministrate(auth)) {
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can administrate a data source.",
          },
        },
        403
      );
    }

    const { resources } = c.req.valid("json");

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorsRes = await connectorsAPI.setConnectorPermissions({
      connectorId: dataSource.connectorId,
      resources: resources.map((r) => ({
        internalId: r.internal_id,
        permission: r.permission,
      })),
    });

    if (connectorsRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "Failed to set the permissions of the data source.",
            connectors_error: connectorsRes.error,
          },
        },
        500
      );
    }

    return c.json({ success: true });
  }
);

export default app;
