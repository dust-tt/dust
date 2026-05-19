import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { upsertTable } from "@app/lib/api/data_sources";
import { deleteTable } from "@app/lib/api/tables";
import { PatchDataSourceTableRequestBodySchema } from "@app/types/api/public/data_sources";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

// Mounted at /api/w/:wId/spaces/:spaceId/data_sources/:dsId/tables/:tableId.
const app = new Hono();

app.patch(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceResource({ requireCanRead: true }),
  validate("json", PatchDataSourceTableRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");
    const tableId = c.req.param("tableId") ?? "";

    if (!dataSource.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to update data in this data source.",
        },
      });
    }

    if (dataSource.connectorId) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You cannot upsert a document on a managed data source.",
        },
      });
    }

    const body = c.req.valid("json");
    const upsertRes = await upsertTable({
      auth,
      params: {
        ...body,
        tableId,
        async: body.async ?? false,
      },
      dataSource,
    });
    if (upsertRes.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error upserting the document.",
        },
      });
    }

    return c.json({ table: upsertRes.value?.table });
  }
);

app.delete(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceResource({ requireCanRead: true }),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");
    const tableId = c.req.param("tableId") ?? "";

    if (!dataSource.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to delete data in this data source.",
        },
      });
    }

    const delRes = await deleteTable({
      owner: auth.getNonNullableWorkspace(),
      dataSource,
      tableId,
    });
    if (delRes.isErr()) {
      switch (delRes.error.type) {
        case "not_found_error":
          return apiError(c, {
            status_code: 404,
            api_error: {
              type: delRes.error.notFoundError.type,
              message: delRes.error.notFoundError.message,
            },
          });
        case "invalid_request_error":
        case "internal_server_error":
          return apiError(c, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to delete table.",
            },
          });
        default:
          assertNever(delRes.error);
      }
    }

    return c.body(null, 200);
  }
);

export default app;
