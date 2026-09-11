import { fetchUserFromSession } from "@app/lib/iam/users";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  GetUserMetadataResponseBody,
  PostUserMetadataKeyResponseBody as PostUserMetadataResponseBody,
} from "@app/types/api/user";
import type { APIErrorResponse } from "@app/types/error";
import { sessionApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context, TypedResponse } from "hono";
import { Op } from "sequelize";
import { z } from "zod";

const PostUserMetadataBodySchema = z.object({
  value: z.string(),
});

const ParamsSchema = z.object({
  key: z.string(),
});

const QuerySchema = z.object({
  workspaceId: z.string().optional(),
});

// Mounted at /api/user/metadata/:key. sessionAuth is applied by the parent
// `/api/user` sub-app.
const app = sessionApp();

/**
 * @cc [owner:smb2268,label:performance] cached-lookups-only
 * This route is called several times on every app load. Resolving the caller MUST only use
 * cached lookups (session user, workspace by sId, membership role) and MUST NOT load the
 * user's workspace list; the only uncached query per request is the metadata row itself.
 */
/**
 * @cc [owner:smb2268,label:security] workspace-scope-requires-membership
 * When `workspaceId` is provided, `workspaceModelId` is set only if the session user has an
 * active membership in that workspace. Otherwise the request falls back to user-scoped
 * metadata rather than failing.
 */
async function loadUserAndWorkspace(
  ctx: Context,
  workspaceId: string | undefined
): Promise<
  | { user: UserResource; workspaceModelId: number | undefined }
  | { err: Response & TypedResponse<APIErrorResponse> }
> {
  const session = ctx.get("session");
  const user = await fetchUserFromSession(session);
  if (!user) {
    return {
      err: apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found" as const,
          message: "The user was not found.",
        },
      }),
    };
  }

  let workspaceModelId: number | undefined;
  if (workspaceId) {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (workspace) {
      const role = await MembershipResource.getActiveRoleForUserInWorkspace({
        user,
        workspace: renderLightWorkspaceType({ workspace }),
      });
      if (role !== "none") {
        workspaceModelId = workspace.id;
      }
    }
  }

  return { user, workspaceModelId };
}

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetUserMetadataResponseBody> => {
    const { workspaceId } = ctx.req.valid("query");
    const r = await loadUserAndWorkspace(ctx, workspaceId);
    if ("err" in r) {
      return r.err;
    }

    const { key } = ctx.req.valid("param");
    const metadata = await r.user.getMetadata(key, r.workspaceModelId);
    return ctx.json({
      metadata: metadata ? { key: metadata.key, value: metadata.value } : null,
    });
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  validate("json", PostUserMetadataBodySchema),
  async (ctx): HandlerResult<PostUserMetadataResponseBody> => {
    const { workspaceId } = ctx.req.valid("query");
    const r = await loadUserAndWorkspace(ctx, workspaceId);
    if ("err" in r) {
      return r.err;
    }

    const { key } = ctx.req.valid("param");
    const { value } = ctx.req.valid("json");
    await r.user.setMetadata(key, value, r.workspaceModelId);
    return ctx.json({ metadata: { key, value } });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx) => {
    const { workspaceId } = ctx.req.valid("query");
    const r = await loadUserAndWorkspace(ctx, workspaceId);
    if ("err" in r) {
      return r.err;
    }

    const { key } = ctx.req.valid("param");
    await r.user.deleteMetadata({
      workspaceId: r.workspaceModelId ?? null,
      key: {
        [Op.like]: `${key}%`,
      },
    });
    return ctx.body(null, 200);
  }
);

export default app;
