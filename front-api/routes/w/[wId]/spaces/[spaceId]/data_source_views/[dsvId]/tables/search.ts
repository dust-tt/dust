import config from "@app/lib/api/config";
import { getContentNodeFromCoreNode } from "@app/lib/api/content_nodes";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import { withDataSourceView } from "@front-api/middleware/with_data_source_view";
import { withSpace } from "@front-api/middleware/with_space";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables/search.
const app = new Hono();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const dataSourceView = ctx.get("dataSourceView");
    const query = ctx.req.query("query");
    if (!query || query.length < MIN_SEARCH_QUERY_SIZE) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Query must be at least ${MIN_SEARCH_QUERY_SIZE} characters long.`,
        },
      });
    }

    const paginationRes = getCursorPaginationParams(ctx.req.query());
    if (paginationRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_pagination_parameters",
          message: "Invalid pagination parameters",
        },
      });
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const searchRes = await coreAPI.searchNodes({
      query,
      filter: {
        data_source_views: [
          {
            data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
            view_filter: dataSourceView.parentsIn ?? [],
          },
        ],
        node_types: ["table"],
      },
      options: {
        limit: paginationRes.value?.limit,
        cursor: paginationRes.value?.cursor ?? undefined,
      },
    });
    if (searchRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: searchRes.error.message,
        },
      });
    }
    const tables = searchRes.value.nodes.map((node) => ({
      ...getContentNodeFromCoreNode(node, "table"),
      dataSourceView: dataSourceView.toJSON(),
    }));
    return ctx.json({
      tables,
      nextPageCursor: searchRes.value.next_page_cursor,
      warningCode: searchRes.value.warning_code,
    });
  }
);

export default app;
