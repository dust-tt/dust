import type {
  SearchMembersAdminResponseBody,
  SearchMembersResponseBody,
} from "@app/lib/api/workspace";
import { searchMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { hasAnyGroupPermission } from "@app/lib/resources/group_management_access";
import { USER_VISIBLE_GROUP_KINDS } from "@app/types/groups";
import type { UserTypeWithWorkspace } from "@app/types/user";
import { ActiveRoleSchema, toLightUserWithWorkspace } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const DEFAULT_PAGE_LIMIT = 25;

const SearchMembersQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(0).max(150).catch(DEFAULT_PAGE_LIMIT),
  managedOnly: z.enum(["true", "false"]).optional(),
  searchTerm: z.string().optional(),
  searchEmails: z.string().optional(),
  groupKind: z.enum(USER_VISIBLE_GROUP_KINDS).optional(),
  // Restricts the results to the members holding that role.
  role: ActiveRoleSchema.optional(),
});

// Emails go in the body so they stay out of URLs and request logs.
const SearchMembersByEmailsBodySchema = z.object({
  emails: z.array(z.string()).min(1).max(MAX_SEARCH_EMAILS),
});

function membersResponse(
  ctx: Context,
  auth: Authenticator,
  { members, total }: { members: UserTypeWithWorkspace[]; total: number }
) {
  // oxlint-disable-next-line dust/noDirectRoleCheck -- non-managers receive only minimal essential user data (LightUserType)
  if (auth.isManager()) {
    return ctx.json({ members, total });
  }

  return ctx.json({
    members: members.map(toLightUserWithWorkspace),
    total,
  });
}

// Mounted at /api/w/:wId/members/search.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", SearchMembersQuerySchema),
  async (
    ctx
  ): HandlerResult<
    SearchMembersResponseBody | SearchMembersAdminResponseBody
  > => {
    const auth = ctx.get("auth");
    const query = ctx.req.valid("query");

    if (
      query.managedOnly === "true" &&
      !(await hasAnyGroupPermission(auth, "read_usage"))
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Group management access required.",
        },
      });
    }

    const emails = query.searchEmails?.split(",");
    if (emails?.length && emails.length > MAX_SEARCH_EMAILS) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Too many emails provided. Maximum is ${MAX_SEARCH_EMAILS}.`,
        },
      });
    }

    const result = await searchMembers(
      auth,
      {
        managedOnly: query.managedOnly === "true",
        searchTerm: query.searchTerm,
        searchEmails: emails,
        groupKind: query.groupKind,
        role: query.role,
      },
      query
    );

    return membersResponse(ctx, auth, result);
  }
);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", SearchMembersByEmailsBodySchema),
  async (
    ctx
  ): HandlerResult<
    SearchMembersResponseBody | SearchMembersAdminResponseBody
  > => {
    const auth = ctx.get("auth");
    const { emails } = ctx.req.valid("json");

    const result = await searchMembers(
      auth,
      { searchEmails: emails },
      { offset: 0, limit: emails.length }
    );

    return membersResponse(ctx, auth, result);
  }
);

export default app;
