import type { GetTagsUsageResponseBody } from "@app/lib/resources/tags_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/tags/usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetTagsUsageResponseBody> => {
    const auth = ctx.get("auth");

    const tagsWithUsage = await TagResource.findAllWithUsage(auth);

    return ctx.json({ tags: tagsWithUsage });
  }
);

export default app;
