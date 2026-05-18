import { Hono } from "hono";

import config from "@app/lib/api/config";
import { getContentNodeFromCoreNode } from "@app/lib/api/content_nodes";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";

import { dataSourceViewResource } from "@front-api/middleware/data_source_view_resource";
import { spaceResource } from "@front-api/middleware/space_resource";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables/search.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  dataSourceViewResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const dataSourceView = c.get("dataSourceView");
    const query = c.req.query("query");
    if (!query || query.length < MIN_SEARCH_QUERY_SIZE) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: `Query must be at least ${MIN_SEARCH_QUERY_SIZE} characters long.`,
          },
        },
        400
      );
    }

    const paginationRes = getCursorPaginationParams(c.req.query());
    if (paginationRes.isErr()) {
      return c.json(
        {
          error: {
            type: "invalid_pagination_parameters",
            message: "Invalid pagination parameters",
          },
        },
        400
      );
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
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: searchRes.error.message,
          },
        },
        500
      );
    }
    const tables = searchRes.value.nodes.map((node) => ({
      ...getContentNodeFromCoreNode(node, "table"),
      dataSourceView: dataSourceView.toJSON(),
    }));
    return c.json({
      tables,
      nextPageCursor: searchRes.value.next_page_cursor,
      warningCode: searchRes.value.warning_code,
    });
  }
);

export default app;
