import config from "@app/lib/api/config";
import {
  listSuperuserMembers,
  type SuperuserMutationError,
  setDustSuperUser,
  setPokeRoles,
} from "@app/lib/api/poke/superusers";
import { Authenticator } from "@app/lib/auth";
import {
  hasPokeRole,
  loadRolesForEditing,
  PokeRoleSchema,
} from "@app/lib/poke/roles";
import { auditLog } from "@app/logger/logger";
import { normalizeEmail, type PokeGetSuperusers } from "@app/types/poke/roles";
import { isDevelopment } from "@app/types/shared/env";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const SetRolesBodySchema = z.object({
  email: z.string().email(),
  roles: z.array(PokeRoleSchema).nullable(),
});
const SetSuperuserBodySchema = z.object({ isDustSuperUser: z.boolean() });

async function getAdminContext(ctx: Context<PokeCtx>) {
  const workspaceId = config.getProductionDustWorkspaceId();
  if (!workspaceId) {
    throw new Error("Production Dust workspace ID is not configured.");
  }

  const auth = await Authenticator.fromSuperUserSession(
    ctx.get("session"),
    workspaceId
  );
  const rolesConfig = await loadRolesForEditing();
  const actorEmail = normalizeEmail(auth.getNonNullableUser().email);

  if (
    !isDevelopment() &&
    !hasPokeRole(rolesConfig[actorEmail] ?? [], ["admin"])
  ) {
    return null;
  }

  return { auth, rolesConfig };
}

function adminOnly(ctx: Context<PokeCtx>) {
  return apiError(ctx, {
    status_code: 403,
    api_error: {
      type: "workspace_auth_error",
      message: "Only poke admins can manage superusers.",
    },
  });
}

function mutationError(ctx: Context<PokeCtx>, error: SuperuserMutationError) {
  return apiError(ctx, {
    status_code: error.type === "not_found" ? 404 : 400,
    api_error: {
      type:
        error.type === "not_found" ? "user_not_found" : "invalid_request_error",
      message: error.message,
    },
  });
}

const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetSuperusers> => {
  const admin = await getAdminContext(ctx);
  if (!admin) {
    return adminOnly(ctx);
  }
  return ctx.json({
    members: await listSuperuserMembers(admin.auth),
    roleEntries: admin.rolesConfig,
  });
});

/** Add, update, or remove an email entry in poke-roles.json. @ignoreswagger */
app.patch(
  "/roles",
  validate("json", SetRolesBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const admin = await getAdminContext(ctx);
    if (!admin) {
      return adminOnly(ctx);
    }
    const { email, roles } = ctx.req.valid("json");
    const result = await setPokeRoles(
      admin.auth,
      admin.rolesConfig,
      email,
      roles
    );
    if (result.isErr()) {
      return mutationError(ctx, result.error);
    }

    auditLog(
      {
        author: admin.auth.getNonNullableUser().toJSON(),
        action: roles === null ? "poke_roles.removed" : "poke_roles.updated",
        workspaceId: admin.auth.getNonNullableWorkspace().sId,
        targetEmail: result.value.email,
        previousRoles: result.value.previousRoles,
        newRoles: result.value.newRoles,
        region: config.getRegion() ?? "unknown",
      },
      "[Security] Poke roles changed"
    );
    return ctx.json({ success: true });
  }
);

/** Toggle the database isDustSuperUser flag. @ignoreswagger */
app.patch(
  "/:userId/superuser",
  validate("json", SetSuperuserBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const admin = await getAdminContext(ctx);
    if (!admin) {
      return adminOnly(ctx);
    }
    const { isDustSuperUser } = ctx.req.valid("json");
    const result = await setDustSuperUser(
      admin.auth,
      ctx.req.param("userId"),
      isDustSuperUser
    );
    if (result.isErr()) {
      return mutationError(ctx, result.error);
    }

    auditLog(
      {
        author: admin.auth.getNonNullableUser().toJSON(),
        action: "dust_superuser.toggled",
        workspaceId: admin.auth.getNonNullableWorkspace().sId,
        targetUserId: result.value.userId,
        targetEmail: result.value.email,
        previousValue: result.value.previousValue,
        newValue: result.value.newValue,
        region: config.getRegion() ?? "unknown",
      },
      "[Security] Dust superuser flag changed"
    );
    return ctx.json({ success: true });
  }
);

export default app;
