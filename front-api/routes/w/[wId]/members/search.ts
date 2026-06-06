import type {
  SearchMembersAdminResponseBody,
  SearchMembersResponseBody,
} from "@app/lib/api/workspace";
import { searchMembers } from "@app/lib/api/workspace";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { GROUP_KINDS } from "@app/types/groups";
import { toLightUserWithWorkspace } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

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

// Mounted at /api/w/:wId/members/search.
const app = workspaceApp();

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

    // biome-ignore lint/plugin/noDirectRoleCheck: non-admins receive only minimal essential user data (LightUserType)
    if (auth.isAdmin()) {
      return ctx.json({ members, total });
    }

    return ctx.json({
      members: members.map(toLightUserWithWorkspace),
      total,
    });
  }
);

export default app;
