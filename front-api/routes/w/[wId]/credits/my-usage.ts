import type { GetMemberUsageResponseBody } from "@app/lib/api/credits/members_usage";
import { getMemberUsage } from "@app/lib/api/credits/members_usage";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/my-usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetMemberUsageResponseBody> => {
  const auth = ctx.get("auth");
  const body = await getMemberUsage({ auth });
  return ctx.json(body);
});

export default app;
