import {
  GetContentNodesOrChildrenRequestBody as ContentNodesBody,
  getContentNodesForDataSourceView,
} from "@app/lib/api/data_source_view";
import { getCursorPaginationParams } from "@app/lib/api/pagination";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withDataSourceView } from "@front-api/middlewares/with_data_source_view";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/content-nodes.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  withDataSourceView({ requireCanReadOrAdministrate: true }),
  validate("json", ContentNodesBody),
  async (ctx) => {
    const dataSourceView = ctx.get("dataSourceView");
    const { internalIds, parentId, viewType, sorting } = ctx.req.valid("json");

    if (parentId && internalIds) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Cannot fetch with parentId and internalIds at the same time.",
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

    const contentNodesRes = await getContentNodesForDataSourceView(
      dataSourceView,
      {
        internalIds: internalIds
          ? internalIds.filter((id): id is string => id !== null)
          : undefined,
        parentId,
        pagination: paginationRes.value,
        viewType,
        sorting,
      }
    );
    if (contentNodesRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: contentNodesRes.error.message,
        },
      });
    }
    return ctx.json(contentNodesRes.value);
  }
);

export default app;
