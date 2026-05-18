import { Hono } from "hono";
import { z } from "zod";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { UserType } from "@app/types/user";

import { validate } from "@front-api/middleware/validator";

const MEMBERS_LOOKUP_MAX_IDS = 50;

// @hono/zod-validator's "query" target calls c.req.queries() (plural) under
// the hood and collapses single-value keys to scalar / preserves repeated
// keys as arrays. Same shape as legacy NextApiRequest.query: ?ids=1 → "1",
// ?ids=1&ids=2 → ["1", "2"]. The union accepts both branches.
const MembersLookupQuerySchema = z.object({
  ids: z.union([z.coerce.number(), z.array(z.coerce.number())]),
});

export type MembersLookupResponseBody = {
  users: UserType[];
};

// Mounted at /api/w/:wId/members/lookup.
const app = new Hono();

app.get("/", validate("query", MembersLookupQuerySchema), async (c) => {
  const auth = c.get("auth");
  const { ids: rawIds } = c.req.valid("query");
  const ids = Array.isArray(rawIds) ? rawIds : [rawIds];

  if (ids.length === 0) {
    const body: MembersLookupResponseBody = { users: [] };
    return c.json(body);
  }

  if (ids.length > MEMBERS_LOOKUP_MAX_IDS) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: `Too many ids provided. Maximum is ${MEMBERS_LOOKUP_MAX_IDS}.`,
        },
      },
      400
    );
  }

  const uniqueIds = Array.from(new Set(ids));
  const users = await UserResource.fetchByModelIds(uniqueIds);

  if (users.length === 0) {
    const body: MembersLookupResponseBody = { users: [] };
    return c.json(body);
  }

  const owner = auth.getNonNullableWorkspace();
  const { memberships } = await MembershipResource.getLatestMemberships({
    users,
    workspace: owner,
  });

  const validUserIds = new Set(memberships.map((m) => m.userId));
  const filteredUsers = users.filter((user) => validUserIds.has(user.id));

  const body: MembersLookupResponseBody = {
    users: filteredUsers.map((user) => user.toJSON()),
  };
  return c.json(body);
});

export default app;
