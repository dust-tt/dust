import apiConfig from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/folders/:fId.
const app = new Hono();

app.delete(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceResource({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");
    const fId = ctx.req.param("fId") ?? "";
    if (!fId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid path parameters.",
        },
      });
    }

    if (!dataSource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to delete data in this data source.",
        },
      });
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const delRes = await coreAPI.deleteDataSourceFolder({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      folderId: fId,
    });
    if (delRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error deleting the folder.",
          data_source_error: delRes.error,
        },
      });
    }

    return ctx.body(null, 204);
  }
);

export default app;
