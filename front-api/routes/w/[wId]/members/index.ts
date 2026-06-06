import type { GetMembersResponseBody } from "@app/lib/api/workspace";
import { getMembers } from "@app/lib/api/workspace";
import type { MembershipsPaginationParams } from "@app/lib/resources/membership_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

import member from "./[uId]";
import lookup from "./lookup";
import me from "./me";
import search from "./search";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 150;

const MembersPaginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_PAGE_LIMIT)
    .catch(DEFAULT_PAGE_LIMIT),
  orderColumn: z.literal("createdAt").catch("createdAt"),
  orderDirection: z.enum(["asc", "desc"]).catch("desc"),
  lastValue: z.coerce.number().optional().catch(undefined),
  role: z.string().optional(),
});

function buildUrlWithParams(
  ctx: Context,
  newParams: MembershipsPaginationParams | undefined
) {
  if (!newParams) {
    return undefined;
  }

  const url = new URL(ctx.req.url);
  Object.entries(newParams).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value.toString());
    }
  });
  return url.pathname + url.search;
}

// Mounted under /api/w/:wId/members.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  validate("query", MembersPaginationSchema),
  async (ctx): HandlerResult<GetMembersResponseBody> => {
    const auth = ctx.get("auth");

    const { role, ...paginationParams } = ctx.req.valid("query");

    const filter =
      role === "admin"
        ? { roles: ["admin" as const], activeOnly: true }
        : { activeOnly: true };

    const { members, total, nextPageParams } = await getMembers(
      auth,
      filter,
      paginationParams
    );

    return ctx.json({
      members,
      total,
      nextPageUrl: buildUrlWithParams(ctx, nextPageParams),
    });
  }
);

app.route("/lookup", lookup);
app.route("/me", me);
app.route("/search", search);
app.route("/:uId", member);

export default app;
