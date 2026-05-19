import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import apiConfig from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";

import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/folders/:fId.
const app = new Hono();

app.delete(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");
    const fId = c.req.param("fId") ?? "";
    if (!fId) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid path parameters.",
        },
      });
    }

    if (!dataSource.canWrite(auth)) {
      return apiError(c, {
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
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error deleting the folder.",
          data_source_error: delRes.error,
        },
      });
    }

    return c.body(null, 204);
  }
);

export default app;
