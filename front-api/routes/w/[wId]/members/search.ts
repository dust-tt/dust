import { searchMembers } from "@app/lib/api/workspace";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { GROUP_KINDS } from "@app/types/groups";
import type {
  LightMemberTypeWithWorkspaceRole,
  UserTypeWithWorkspace,
} from "@app/types/user";
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

export type SearchMembersResponseBody = {
  members: LightMemberTypeWithWorkspaceRole[];
  total: number;
};

type SearchMembersAdminResponseBody = {
  members: UserTypeWithWorkspace[];
  total: number;
};

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

    if (auth.isAdmin()) {
      return ctx.json({ members, total });
    }

    return ctx.json({
      members: members.map((m) => ({
        sId: m.sId,
        firstName: m.firstName,
        lastName: m.lastName,
        fullName: m.fullName,
        image: m.image,
        workspace: { role: m.workspace.role },
      })),
      total,
    });
  }
);

export default app;
