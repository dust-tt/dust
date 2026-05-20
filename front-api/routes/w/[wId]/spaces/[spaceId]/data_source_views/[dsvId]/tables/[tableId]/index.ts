import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { apiError } from "@front-api/middleware/utils";
import { withDataSourceView } from "@front-api/middleware/with_data_source_view";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables/:tableId.
const app = new Hono();

app.get(
  "/",
  withSpace({ requireCanRead: true }),
  withDataSourceView({ requireCanRead: true }),
  async (ctx) => {
    const dataSourceView = ctx.get("dataSourceView");
    const tableId = ctx.req.param("tableId") ?? "";
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const tableRes = await coreAPI.getTable({
      projectId: dataSourceView.dataSource.dustAPIProjectId,
      dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
      tableId,
    });
    if (tableRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message:
            "There was an error retrieving the data source view's document.",
          data_source_error: tableRes.error,
        },
      });
    }
    return ctx.json({ table: tableRes.value.table });
  }
);

export default app;
