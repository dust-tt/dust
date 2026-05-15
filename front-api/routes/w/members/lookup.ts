import { Hono } from "hono";
import { z } from "zod";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { UserType } from "@app/types/user";

import { validate } from "../../../middleware/validator";

const MEMBERS_LOOKUP_MAX_IDS = 50;

// Hono's "query" validator returns string for a single occurrence and string[]
// for repeated keys (?ids=1 vs. ?ids=1&ids=2), mirroring the legacy
// NextApiRequest behavior. The union accepts both shapes.
const MembersLookupQuerySchema = z.object({
  ids: z.union([z.coerce.number(), z.array(z.coerce.number())]),
});

export type MembersLookupResponseBody = {
  users: UserType[];
};

export const lookupMembersApp = new Hono();

lookupMembersApp.get(
  "/",
  validate("query", MembersLookupQuerySchema),
  async (c) => {
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
  }
);
