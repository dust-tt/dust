import { listDiscoveryTrendingItems } from "@app/lib/api/discovery";
import type { GetDiscoveryTrendingResponseBody } from "@app/types/api/discovery";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/discovery/trending.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetDiscoveryTrendingResponseBody> => {
  const auth = ctx.get("auth");

  const result = await listDiscoveryTrendingItems(auth);
  if (result.isErr()) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to load trending discovery items.",
        },
      },
      result.error
    );
  }

  return ctx.json({ items: result.value });
});

export default app;
