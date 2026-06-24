import { getPaginationParams } from "@app/lib/api/pagination";
import { searchReadablePods } from "@app/lib/api/projects/list";
import type { SearchProjectsResponseBody } from "@app/types/api/projects/list";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted under /api/w/:wId/spaces/search_projects.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<SearchProjectsResponseBody> => {
  const auth = ctx.get("auth");

  const paginationRes = getPaginationParams(ctx.req.query(), {
    defaultLimit: 20,
    defaultOrderColumn: "name",
    defaultOrderDirection: "asc",
    supportedOrderColumn: ["name"],
    maxLimit: 100,
  });

  if (paginationRes.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: paginationRes.error.reason,
      },
    });
  }

  const queryString = ctx.req.query("query");
  const pagination = paginationRes.value;

  const result = await searchReadablePods(auth, {
    query: queryString,
    pagination: {
      limit: pagination.limit,
      lastValue: pagination.lastValue,
      orderDirection: pagination.orderDirection,
    },
  });

  return ctx.json(result);
});

export default app;
