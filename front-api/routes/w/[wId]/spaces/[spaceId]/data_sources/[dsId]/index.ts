import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

import configuration from "./configuration";
import documents from "./documents";
import folders from "./folders";
import tables from "./tables";

const PatchDataSourceWithoutProviderRequestBodySchema = z.object({
  description: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId.
const app = new Hono();

app.patch(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceResource({}),
  validate("json", PatchDataSourceWithoutProviderRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const dataSource = c.get("dataSource");

    if (space.isSystem() && !space.canAdministrate(auth)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Only the users that are `admins` for the current workspace can update a data source.",
        },
      });
    }
    if (space.isGlobal() && !space.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can update a data source.",
        },
      });
    }

    if (dataSource.connectorId) {
      // Patching a managed data source is not yet implemented.
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Managed data sources cannot be updated.",
        },
      });
    }

    const { description } = c.req.valid("json");
    await dataSource.setDescription(description);

    void emitAuditLogEvent({
      auth,
      action: "datasource.updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("data_source", dataSource),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        data_source_name: dataSource.name,
        field: "description",
      },
    });

    return c.json({ dataSource: dataSource.toJSON() });
  }
);

app.delete(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceResource({}),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const dataSource = c.get("dataSource");

    if (space.isSystem() && !space.canAdministrate(auth)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Only the users that are `admins` for the current workspace can update a data source.",
        },
      });
    }
    if (space.isGlobal() && !space.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can update a data source.",
        },
      });
    }

    const isAuthorized =
      space.canWrite(auth) ||
      // Remote database connectors can also be deleted by system-space admins.
      (space.isSystem() &&
        space.canAdministrate(auth) &&
        isRemoteDatabase(dataSource));
    if (!isAuthorized) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that have `write` permission for the current space can delete a data source.",
        },
      });
    }

    if (
      dataSource.connectorId &&
      dataSource.connectorProvider &&
      !CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].isDeletable
    ) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Managed data sources cannot be deleted.",
        },
      });
    }

    const dRes = await softDeleteDataSourceAndLaunchScrubWorkflow(auth, {
      dataSource,
    });
    if (dRes.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: dRes.error.message,
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "datasource.deleted",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("data_source", dataSource),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        data_source_name: dataSource.name,
        provider: dataSource.connectorProvider ?? "folder",
        space_id: space.sId,
      },
    });

    return c.body(null, 204);
  }
);

app.route("/configuration", configuration);
app.route("/documents", documents);
app.route("/folders", folders);
app.route("/tables", tables);

export default app;
