import { TagResource } from "@app/lib/resources/tags_resource";
import type { TagTypeWithUsage } from "@app/types/tag";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetTagsUsageResponseBody = {
  tags: TagTypeWithUsage[];
};

// Mounted at /api/w/:wId/tags/usage.
const app = workspaceApp();

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
