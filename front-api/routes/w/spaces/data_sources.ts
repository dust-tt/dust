import { Hono } from "hono";

import apiConfig from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";

import { dataSourceResource } from "../../../middleware/data_source_resource";
import { spaceResource } from "../../../middleware/space_resource";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId.
export const dataSourcesApp = new Hono();

dataSourcesApp.delete(
  "/folders/:fId",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");
    const fId = c.req.param("fId") ?? "";
    if (!fId) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Invalid path parameters.",
          },
        },
        400
      );
    }

    if (!dataSource.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message: "You are not allowed to delete data in this data source.",
          },
        },
        403
      );
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const delRes = await coreAPI.deleteDataSourceFolder({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      folderId: fId,
    });
    if (delRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "There was an error deleting the folder.",
            data_source_error: delRes.error,
          },
        },
        500
      );
    }

    return c.body(null, 204);
  }
);
