import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import {
  hasPokeRole,
  loadRolesForEditing,
  PokeRoleSchema,
  type RolesConfig,
  writeRoles,
} from "@app/lib/poke/roles";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { auditLog } from "@app/logger/logger";
import {
  normalizeEmail,
  type PokeGetSuperusers,
  type PokeRole,
} from "@app/types/poke/roles";
import { isDevelopment } from "@app/types/shared/env";
import { Err, Ok, type Result } from "@app/types/shared/result";
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

type MutationError = {
  type: "not_found" | "not_active_member";
  message: string;
};

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

async function isActiveWorkspaceMember(
  auth: Authenticator,
  user: UserResource
): Promise<boolean> {
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({
        workspace: auth.getNonNullableWorkspace(),
      }),
    });
  return membership !== null;
}

async function listMembers(
  auth: Authenticator
): Promise<PokeGetSuperusers["members"]> {
  const workspace = renderLightWorkspaceType({
    workspace: auth.getNonNullableWorkspace(),
  });
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const users = await UserResource.fetchByModelIds(
    memberships.flatMap((membership) =>
      membership.userId === undefined ? [] : [membership.userId]
    )
  );
  const usersById = new Map(users.map((user) => [user.id, user]));

  const members = memberships.flatMap((membership) => {
    const user = usersById.get(membership.userId);
    if (!user) {
      return [];
    }
    return [
      {
        sId: user.sId,
        email: user.email,
        fullName: user.fullName(),
        membershipRole: membership.role,
        isDustSuperUser: user.isDustSuperUser,
      },
    ];
  });

  members.sort((a, b) => a.email.localeCompare(b.email));
  return members;
}

async function updateRoles(
  auth: Authenticator,
  rolesConfig: RolesConfig,
  email: string,
  roles: PokeRole[] | null
): Promise<
  Result<
    { email: string; previousRoles: PokeRole[]; newRoles: PokeRole[] },
    MutationError
  >
> {
  const normalized = normalizeEmail(email);
  const previousRoles = rolesConfig[normalized] ?? [];

  if (roles === null) {
    const nextRoles = { ...rolesConfig };
    delete nextRoles[normalized];
    await writeRoles(nextRoles);
    return new Ok({ email: normalized, previousRoles, newRoles: [] });
  }

  const user = await UserResource.fetchByEmail(normalized);
  if (!user) {
    return new Err({ type: "not_found", message: "User not found." });
  }
  if (!(await isActiveWorkspaceMember(auth, user))) {
    return new Err({
      type: "not_active_member",
      message: "User is not an active member of the Dust workspace.",
    });
  }

  await writeRoles({ ...rolesConfig, [normalized]: roles });
  return new Ok({ email: normalized, previousRoles, newRoles: roles });
}

async function updateDustSuperUser(
  auth: Authenticator,
  userSId: string,
  isDustSuperUser: boolean
): Promise<
  Result<
    {
      email: string;
      userSId: string;
      previousValue: boolean;
      newValue: boolean;
    },
    MutationError
  >
> {
  const user = await UserResource.fetchById(userSId);
  if (!user) {
    return new Err({ type: "not_found", message: "User not found." });
  }
  if (!(await isActiveWorkspaceMember(auth, user))) {
    return new Err({
      type: "not_active_member",
      message: "User is not an active member of the Dust workspace.",
    });
  }

  const previousValue = user.isDustSuperUser;
  if (previousValue !== isDustSuperUser) {
    await user.setDustSuperUser(isDustSuperUser);
  }
  return new Ok({
    email: user.email,
    userSId: user.sId,
    previousValue,
    newValue: isDustSuperUser,
  });
}

function mutationError(ctx: Context<PokeCtx>, error: MutationError) {
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
    members: await listMembers(admin.auth),
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
    const result = await updateRoles(
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
  "/:userSId/superuser",
  validate("json", SetSuperuserBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const admin = await getAdminContext(ctx);
    if (!admin) {
      return adminOnly(ctx);
    }
    const { isDustSuperUser } = ctx.req.valid("json");
    const result = await updateDustSuperUser(
      admin.auth,
      ctx.req.param("userSId"),
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
        targetUserId: result.value.userSId,
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
