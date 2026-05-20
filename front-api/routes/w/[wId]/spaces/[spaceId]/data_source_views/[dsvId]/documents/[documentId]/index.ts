import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { dataSourceViewResource } from "@front-api/middleware/data_source_view_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/documents/:documentId.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceViewResource({ requireCanRead: true }),
  async (ctx) => {
    const dataSourceView = ctx.get("dataSourceView");
    const documentId = ctx.req.param("documentId") ?? "";
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const doc = await coreAPI.getDataSourceDocument({
      dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
      documentId,
      projectId: dataSourceView.dataSource.dustAPIProjectId,
      viewFilter: dataSourceView.toViewFilter(),
    });
    if (doc.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message:
            "There was an error retrieving the data source view's document.",
          data_source_error: doc.error,
        },
      });
    }
    return ctx.json({ document: doc.value.document });
  }
);

export default app;
