import type { ListTablesResponseBody } from "@app/lib/api/data_source_view";
import { getFlattenedContentNodesOfViewTypeForDataSourceView } from "@app/lib/api/data_source_view";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withDataSourceView } from "@front-api/middlewares/with_data_source_view";
import { withSpace } from "@front-api/middlewares/with_space";
import tableId from "./[tableId]";
import search from "./search";

export type { ListTablesResponseBody };

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables.
const app = workspaceApp();

// GET / — list tables.
/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<ListTablesResponseBody> => {
    const dataSourceView = ctx.get("dataSourceView");
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
    const contentNodes =
      await getFlattenedContentNodesOfViewTypeForDataSourceView(
        dataSourceView,
        {
          viewType: "table",
          pagination: paginationRes.value,
        }
      );
    if (contentNodes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: contentNodes.error.message,
        },
      });
    }
    return ctx.json({
      tables: contentNodes.value.nodes,
      nextPageCursor: contentNodes.value.nextPageCursor,
    });
  }
);

// Register `/search` BEFORE `/:tableId` so the param route does not swallow
// "search" as an id. Hono's router scans in registration order.
app.route("/search", search);
app.route("/:tableId", tableId);

export default app;
