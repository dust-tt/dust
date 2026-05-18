import { Hono } from "hono";
import { z } from "zod";

import { searchMembers } from "@app/lib/api/workspace";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { GROUP_KINDS } from "@app/types/groups";
import type { UserTypeWithWorkspace } from "@app/types/user";

import { validate } from "@front-api/middleware/validator";

const DEFAULT_PAGE_LIMIT = 25;

const SearchMembersQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(0).max(150).catch(DEFAULT_PAGE_LIMIT),
  searchTerm: z.string().optional(),
  searchEmails: z.string().optional(),
  groupKind: z.enum(GROUP_KINDS).exclude(["system"]).optional(),
  buildersOnly: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type SearchMembersResponseBody = {
  members: UserTypeWithWorkspace[];
  total: number;
};

// Mounted at /api/w/:wId/members/search.
const app = new Hono();

app.get("/", validate("query", SearchMembersQuerySchema), async (c) => {
  const auth = c.get("auth");
  const query = c.req.valid("query");

  const emails = query.searchEmails?.split(",");
  if (emails?.length && emails.length > MAX_SEARCH_EMAILS) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: `Too many emails provided. Maximum is ${MAX_SEARCH_EMAILS}.`,
        },
      },
      400
    );
  }

  const { members, total } = await searchMembers(
    auth,
    {
      searchTerm: query.searchTerm,
      searchEmails: emails,
      groupKind: query.groupKind,
      buildersOnly: query.buildersOnly,
    },
    query
  );

  const body: SearchMembersResponseBody = { members, total };
  return c.json(body);
});

export default app;
