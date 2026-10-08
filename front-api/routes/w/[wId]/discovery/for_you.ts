import { listDiscoveryForYouItems } from "@app/lib/api/discovery";
import type { GetDiscoveryForYouResponseBody } from "@app/types/api/discovery";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/discovery/for_you.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetDiscoveryForYouResponseBody> => {
  const auth = ctx.get("auth");

  const result = await listDiscoveryForYouItems(auth);
  if (result.isErr()) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to load For You discovery items.",
        },
      },
      result.error
    );
  }

  return ctx.json({ items: result.value });
});

export default app;
