import { listFeaturedDiscoveryItems } from "@app/lib/api/discovery";
import type { GetFeaturedDiscoveryItemsResponseBody } from "@app/types/api/discovery";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/discovery/featured.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetFeaturedDiscoveryItemsResponseBody> => {
    return ctx.json(await listFeaturedDiscoveryItems(ctx.get("auth")), 200);
  }
);

export default app;
