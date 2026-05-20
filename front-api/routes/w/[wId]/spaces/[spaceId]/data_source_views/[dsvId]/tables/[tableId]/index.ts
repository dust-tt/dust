import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { dataSourceViewResource } from "@front-api/middleware/data_source_view_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables/:tableId.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceViewResource({ requireCanRead: true }),
  async (c) => {
    const dataSourceView = c.get("dataSourceView");
    const tableId = c.req.param("tableId") ?? "";
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const tableRes = await coreAPI.getTable({
      projectId: dataSourceView.dataSource.dustAPIProjectId,
      dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
      tableId,
    });
    if (tableRes.isErr()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message:
            "There was an error retrieving the data source view's document.",
          data_source_error: tableRes.error,
        },
      });
    }
    return c.json({ table: tableRes.value.table });
  }
);

export default app;
