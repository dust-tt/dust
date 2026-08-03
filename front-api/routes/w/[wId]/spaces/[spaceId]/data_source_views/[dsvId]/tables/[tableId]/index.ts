import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { GetDataSourceViewTableResponseBody } from "@app/types/api/tables";
import { CoreAPI } from "@app/types/core/core_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withDataSourceView } from "@front-api/middlewares/with_data_source_view";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  tableId: z.string(),
});

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables/:tableId.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  withDataSourceView({ requireCanRead: true }),
  async (ctx): HandlerResult<GetDataSourceViewTableResponseBody> => {
    const dataSourceView = ctx.get("dataSourceView");
    const { tableId } = ctx.req.valid("param");
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
