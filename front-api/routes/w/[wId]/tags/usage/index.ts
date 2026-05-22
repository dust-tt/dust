import { TagResource } from "@app/lib/resources/tags_resource";
import type { TagTypeWithUsage } from "@app/types/tag";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type GetTagsUsageResponseBody = {
  tags: TagTypeWithUsage[];
};

// Mounted at /api/w/:wId/tags/usage.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetTagsUsageResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Only workspace administrators can see tags usage",
      },
    });
  }

  const tagsWithUsage = await TagResource.findAllWithUsage(auth);

  return ctx.json({ tags: tagsWithUsage });
});

export default app;
