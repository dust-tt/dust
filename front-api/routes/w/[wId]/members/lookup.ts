import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  MembersLookupAdminResponseBody,
  MembersLookupResponseBody,
} from "@app/types/api/members";
import { toLightUser } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const MEMBERS_LOOKUP_MAX_IDS = 50;

// @hono/zod-validator's "query" target calls ctx.req.queries() (plural) under
// the hood and collapses single-value keys to scalar / preserves repeated
// keys as arrays. Same shape as legacy NextApiRequest.query: ?ids=1 → "1",
// ?ids=1&ids=2 → ["1", "2"]. The union accepts both branches.
const MembersLookupQuerySchema = z.object({
  ids: z.union([z.coerce.number(), z.array(z.coerce.number())]),
});

// Mounted at /api/w/:wId/members/lookup.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", MembersLookupQuerySchema),
  async (
    ctx
  ): HandlerResult<
    MembersLookupResponseBody | MembersLookupAdminResponseBody
  > => {
    const auth = ctx.get("auth");
    const { ids: rawIds } = ctx.req.valid("query");
    const ids = Array.isArray(rawIds) ? rawIds : [rawIds];

    if (ids.length === 0) {
      return ctx.json({ users: [] });
    }

    if (ids.length > MEMBERS_LOOKUP_MAX_IDS) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Too many ids provided. Maximum is ${MEMBERS_LOOKUP_MAX_IDS}.`,
        },
      });
    }

    const uniqueIds = Array.from(new Set(ids));
    const users = await UserResource.fetchByModelIds(uniqueIds);

    if (users.length === 0) {
      return ctx.json({ users: [] });
    }

    const owner = auth.getNonNullableWorkspace();
    const { memberships } = await MembershipResource.getLatestMemberships({
      users,
      workspace: owner,
    });

    const validUserIds = new Set(memberships.map((m) => m.userId));
    const filteredUsers = users.filter((user) => validUserIds.has(user.id));

    // biome-ignore lint/plugin/noDirectRoleCheck: non-admins receive only minimal essential user data (LightUserType)
    if (auth.isAdmin()) {
      return ctx.json({
        users: filteredUsers.map((user) => user.toJSON()),
      });
    }

    return ctx.json({
      users: filteredUsers.map((user) => ({
        ...toLightUser(user.toJSON()),
        id: user.id,
      })),
    });
  }
);

export default app;
