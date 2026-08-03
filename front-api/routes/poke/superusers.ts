import config from "@app/lib/api/config";
import type { PokeGetSuperusers } from "@app/lib/api/poke/superusers";
import {
  listSuperuserMembers,
  SuperuserAdminError,
  setDustSuperUser,
  setPokeRoles,
} from "@app/lib/api/poke/superusers";
import { Authenticator } from "@app/lib/auth";
import { hasPokeRole, PokeRoleSchema } from "@app/lib/poke/roles";
import { auditLog } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const SetRolesBodySchema = z.object({
  email: z.string().email(),
  roles: z.array(PokeRoleSchema).min(1).nullable(),
});
const SetSuperuserBodySchema = z.object({ isDustSuperUser: z.boolean() });

function requireAdmin(ctx: Context<PokeCtx>) {
  if (!hasPokeRole(ctx.get("pokeRoles"), ["admin"])) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only poke admins can manage superusers.",
      },
    });
  }
  return null;
}

async function getAuth(ctx: Context<PokeCtx>) {
  const workspaceId = config.getProductionDustWorkspaceId();
  if (!workspaceId) {
    throw new Error("Production Dust workspace ID is not configured.");
  }
  return Authenticator.fromSuperUserSession(ctx.get("session"), workspaceId);
}

function mutationError(ctx: Context<PokeCtx>, error: unknown) {
  if (error instanceof SuperuserAdminError) {
    return apiError(ctx, {
      status_code: error.type === "not_found" ? 404 : 400,
      api_error: {
        type:
          error.type === "not_found"
            ? "user_not_found"
            : "invalid_request_error",
        message: error.message,
      },
    });
  }
  return apiError(ctx, {
    status_code: 500,
    api_error: {
      type: "internal_server_error",
      message: normalizeError(error).message,
    },
  });
}

const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetSuperusers> => {
  const denied = requireAdmin(ctx);
  if (denied) {
    return denied;
  }
  return ctx.json(await listSuperuserMembers(await getAuth(ctx)));
});

/** Add, update, or remove an email entry in poke-roles.json. @ignoreswagger */
app.patch(
  "/roles",
  validate("json", SetRolesBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const denied = requireAdmin(ctx);
    if (denied) {
      return denied;
    }
    const auth = await getAuth(ctx);
    const { email, roles } = ctx.req.valid("json");

    try {
      const result = await setPokeRoles(auth, email, roles);
      auditLog(
        {
          author: auth.getNonNullableUser().toJSON(),
          action: roles === null ? "poke_roles.removed" : "poke_roles.updated",
          workspaceId: auth.getNonNullableWorkspace().sId,
          targetEmail: result.email,
          previousRoles: result.previousRoles,
          newRoles: result.newRoles,
          region: config.getRegion() ?? "unknown",
        },
        "[Security] Poke roles changed"
      );
      return ctx.json({ success: true });
    } catch (error) {
      return mutationError(ctx, error);
    }
  }
);

/** Toggle the database isDustSuperUser flag. @ignoreswagger */
app.patch(
  "/:userSId/superuser",
  validate("json", SetSuperuserBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const denied = requireAdmin(ctx);
    if (denied) {
      return denied;
    }
    const auth = await getAuth(ctx);
    const { isDustSuperUser } = ctx.req.valid("json");

    try {
      const result = await setDustSuperUser(
        auth,
        ctx.req.param("userSId"),
        isDustSuperUser
      );
      auditLog(
        {
          author: auth.getNonNullableUser().toJSON(),
          action: "dust_superuser.toggled",
          workspaceId: auth.getNonNullableWorkspace().sId,
          targetUserId: result.userSId,
          targetEmail: result.email,
          previousValue: result.previousValue,
          newValue: result.newValue,
          region: config.getRegion() ?? "unknown",
        },
        "[Security] Dust superuser flag changed"
      );
      return ctx.json({ success: true });
    } catch (error) {
      return mutationError(ctx, error);
    }
  }
);

export default app;
