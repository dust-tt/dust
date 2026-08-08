import config from "@app/lib/api/config";
import type { SuperuserMutationError } from "@app/lib/api/poke/superusers";
import { Authenticator } from "@app/lib/auth";
import { hasPokeRole, loadRolesForEditing } from "@app/lib/poke/roles";
import { normalizeEmail } from "@app/types/poke/roles";
import { isDevelopment } from "@app/types/shared/env";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

export async function getAdminContext(ctx: Context<PokeCtx>) {
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

export function adminOnly(ctx: Context<PokeCtx>) {
  return apiError(ctx, {
    status_code: 403,
    api_error: {
      type: "workspace_auth_error",
      message: "Only poke admins can manage superusers.",
    },
  });
}

export function mutationError(
  ctx: Context<PokeCtx>,
  error: SuperuserMutationError
) {
  switch (error.type) {
    case "not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: error.message,
        },
      });
    case "not_active_member":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    default:
      return assertNever(error);
  }
}
