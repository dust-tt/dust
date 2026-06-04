import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import {
  getMembersUsage,
  MembersUsagePaginationSchema,
} from "@app/lib/api/credits/members_usage";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetMembersUsageResponseBody };

// Mounted at /api/poke/workspaces/:wId/credits/members-usage.
const app = pokeApp();

app.get(
  "/",
  validate("query", MembersUsagePaginationSchema),
  async (ctx): HandlerResult<GetMembersUsageResponseBody> => {
    const auth = ctx.get("auth");

    const body = await getMembersUsage({
      auth,
      paginationParams: ctx.req.valid("query"),
      includeAlertLinks: true,
    });
    return ctx.json(body);
  }
);

export default app;
