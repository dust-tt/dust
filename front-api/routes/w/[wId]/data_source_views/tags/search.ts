import apiConfig from "@app/lib/api/config";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import type { PostTagSearchResponseBody } from "@app/types/api/data_source_view_tags";
import { PostTagSearchBodySchema } from "@app/types/api/data_source_view_tags";
import { CoreAPI } from "@app/types/core/core_api";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/data_source_views/tags/search.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostTagSearchBodySchema),
  async (ctx): HandlerResult<PostTagSearchResponseBody> => {
    const auth = ctx.get("auth");

    // workspaceAuth already enforces auth.isUser().
    const { dataSourceViewIds, query, queryType } = ctx.req.valid("json");

    const dataSourceViews = await DataSourceViewResource.fetchByIds(
      auth,
      dataSourceViewIds
    );
    if (dataSourceViews.some((dsv) => !dsv.canRead(auth))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not authorized to fetch tags.",
        },
      });
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const result = await coreAPI.searchTags({
      query,
      queryType,
      dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to search tags",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;
