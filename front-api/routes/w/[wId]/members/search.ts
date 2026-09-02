import type {
  SearchMembersAdminResponseBody,
  SearchMembersResponseBody,
} from "@app/lib/api/workspace";
import { searchMembers } from "@app/lib/api/workspace";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { GROUP_KINDS } from "@app/types/groups";
import { ActiveRoleSchema, toLightUserWithWorkspace } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DEFAULT_PAGE_LIMIT = 25;

const GroupKindSchema = z.enum(GROUP_KINDS).exclude(["system"]);

const SearchMembersQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(0).max(150).catch(DEFAULT_PAGE_LIMIT),
  searchTerm: z.string().optional(),
  searchEmails: z.string().optional(),
  // Members carry the names of their groups of these kinds. `groupKinds` is a
  // comma-separated list; `groupKind` is the legacy single-kind form.
  groupKind: GroupKindSchema.optional(),
  groupKinds: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(GroupKindSchema))
    .optional(),
  // Restricts the results to the members holding that role.
  role: ActiveRoleSchema.optional(),
  // Deprecated: the builder-role filter was removed; accepted but ignored to
  // avoid breaking clients that still send it. Remove once no client does.
  buildersOnly: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

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
    const groupKinds =
      query.groupKinds ?? (query.groupKind ? [query.groupKind] : undefined);

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
        groupKinds,
        role: query.role,
      },
      query
    );

    // Non manager callers receive only minimal
    // essential user data (LightUserType).
    if (auth.isManager()) {
      return ctx.json({ members, total });
    }

    return ctx.json({
      members: members.map(toLightUserWithWorkspace),
      total,
    });
  }
);

export default app;
