import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import type {
  PartialFailureState,
  PokeGetSuperusers,
  SuperuserMutationError,
  SuperuserMutationResult,
} from "@app/lib/api/poke/superusers";
import {
  grantSuperuser,
  listSuperuserMembers,
  repairSuperuserDrift,
  revokeSuperuser,
  updateSuperuserRoles,
} from "@app/lib/api/poke/superusers";
import { Authenticator } from "@app/lib/auth";
import { hasPokeRole, PokeRoleSchema } from "@app/lib/poke/roles";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas for mutation request bodies
// ---------------------------------------------------------------------------

const GrantBodySchema = z.object({
  roles: z.array(PokeRoleSchema).min(1),
  generation: z.number(),
});

const RevokeBodySchema = z.object({
  generation: z.number(),
});

const UpdateRolesBodySchema = z.object({
  roles: z.array(PokeRoleSchema).min(1),
  generation: z.number(),
});

const RepairBodySchema = z.object({
  generation: z.number(),
  roles: z.array(PokeRoleSchema).min(1).optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SuperuserMutationResponse {
  result: SuperuserMutationResult;
}

interface SuperuserPartialFailureResponse {
  result: null;
  partialFailure: PartialFailureState;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function adminCheck(ctx: Context<PokeCtx>) {
  const pokeRoles = ctx.get("pokeRoles");
  if (!hasPokeRole(pokeRoles, ["admin"])) {
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

async function resolveAuth(ctx: Context<PokeCtx>) {
  const wId = config.getProductionDustWorkspaceId();
  if (!wId) {
    return {
      auth: null,
      error: apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Production Dust workspace ID is not configured.",
        },
      }),
    };
  }

  const session = ctx.get("session");
  const auth = await Authenticator.fromSuperUserSession(session, wId);
  return { auth, error: null };
}

type SuperuserAuditAction =
  | "superuser.granted"
  | "superuser.revoked"
  | "superuser.roles_updated"
  | "superuser.drift_repaired";

interface EmitSuperuserAuditEventArgs {
  auth: Authenticator;
  action: SuperuserAuditAction;
  target: { sId: string; name: string };
  previousState: SuperuserMutationResult["previousState"];
  currentState: SuperuserMutationResult["newState"];
  outcome: "success" | "partial_failure";
  rolesWritten: boolean;
  dbUpdated: boolean;
  currentDriftState: string;
  remediation: string;
}

function emitSuperuserAuditEvent({
  auth,
  action,
  target,
  previousState,
  currentState,
  outcome,
  rolesWritten,
  dbUpdated,
  currentDriftState,
  remediation,
}: EmitSuperuserAuditEventArgs): void {
  void emitAuditLogEvent({
    auth,
    action,
    targets: [
      buildAuditLogTarget(
        "workspace",
        renderLightWorkspaceType({
          workspace: auth.getNonNullableWorkspace(),
        })
      ),
      buildAuditLogTarget("user", target),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      previous_roles: previousState.pokeRoles.join(","),
      new_roles: currentState.pokeRoles.join(","),
      previous_is_dust_super_user: String(previousState.isDustSuperUser),
      new_is_dust_super_user: String(currentState.isDustSuperUser),
      region: config.getRegion() ?? "unknown",
      outcome,
      roles_written: String(rolesWritten),
      db_updated: String(dbUpdated),
      current_drift_state: currentDriftState,
      remediation,
    },
  });
}

function mapMutationError(
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
    case "already_superuser":
    case "not_superuser":
    case "last_admin":
    case "self_removal":
    case "no_drift":
    case "invalid_request_error":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "conflict":
      return apiError(ctx, {
        status_code: 409,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "storage_error":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
        },
      });
    case "partial_failure":
      return ctx.json(
        {
          result: null,
          partialFailure: error.partialFailure,
        } satisfies SuperuserPartialFailureResponse,
        500
      );
    default:
      assertNever(error);
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

// Mounted at /api/poke/superusers. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetSuperusers> => {
  const denied = adminCheck(ctx);
  if (denied) {
    return denied;
  }

  const { auth, error } = await resolveAuth(ctx);
  if (!auth) {
    return error;
  }

  const result = await listSuperuserMembers(auth);
  return ctx.json(result);
});

// ---------------------------------------------------------------------------
// POST /:userSId/grant — Grant superuser access
// ---------------------------------------------------------------------------

/** @ignoreswagger */
app.post(
  "/:userSId/grant",
  validate("json", GrantBodySchema),
  async (
    ctx
  ): HandlerResult<
    SuperuserMutationResponse | SuperuserPartialFailureResponse
  > => {
    const denied = adminCheck(ctx);
    if (denied) {
      return denied;
    }

    const { auth, error } = await resolveAuth(ctx);
    if (!auth) {
      return error;
    }

    const user = await UserResource.fetchById(ctx.req.param("userSId"));
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "User not found.",
        },
      });
    }

    const { roles, generation } = ctx.req.valid("json");

    const result = await grantSuperuser(auth, user.email, roles, generation);
    if (result.isErr()) {
      if (result.error.type === "partial_failure") {
        const partialFailure = result.error.partialFailure;
        emitSuperuserAuditEvent({
          auth,
          action: "superuser.granted",
          target: { sId: user.sId, name: user.fullName() },
          previousState: partialFailure.previousState,
          currentState: partialFailure.currentState,
          outcome: "partial_failure",
          rolesWritten: partialFailure.rolesWritten,
          dbUpdated: partialFailure.dbUpdated,
          currentDriftState: partialFailure.currentDriftState,
          remediation: partialFailure.remediation,
        });
      }
      return mapMutationError(ctx, result.error);
    }

    emitSuperuserAuditEvent({
      auth,
      action: "superuser.granted",
      target: {
        sId: result.value.targetSId,
        name: result.value.targetName,
      },
      previousState: result.value.previousState,
      currentState: result.value.newState,
      outcome: "success",
      rolesWritten: true,
      dbUpdated: true,
      currentDriftState: "ok",
      remediation: "",
    });

    return ctx.json({ result: result.value });
  }
);

// ---------------------------------------------------------------------------
// POST /:userSId/revoke — Revoke superuser access
// ---------------------------------------------------------------------------

/** @ignoreswagger */
app.post(
  "/:userSId/revoke",
  validate("json", RevokeBodySchema),
  async (
    ctx
  ): HandlerResult<
    SuperuserMutationResponse | SuperuserPartialFailureResponse
  > => {
    const denied = adminCheck(ctx);
    if (denied) {
      return denied;
    }

    const { auth, error } = await resolveAuth(ctx);
    if (!auth) {
      return error;
    }

    const user = await UserResource.fetchById(ctx.req.param("userSId"));
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "User not found.",
        },
      });
    }

    const { generation } = ctx.req.valid("json");

    const result = await revokeSuperuser(auth, user.email, generation);
    if (result.isErr()) {
      if (result.error.type === "partial_failure") {
        const partialFailure = result.error.partialFailure;
        emitSuperuserAuditEvent({
          auth,
          action: "superuser.revoked",
          target: { sId: user.sId, name: user.fullName() },
          previousState: partialFailure.previousState,
          currentState: partialFailure.currentState,
          outcome: "partial_failure",
          rolesWritten: partialFailure.rolesWritten,
          dbUpdated: partialFailure.dbUpdated,
          currentDriftState: partialFailure.currentDriftState,
          remediation: partialFailure.remediation,
        });
      }
      return mapMutationError(ctx, result.error);
    }

    emitSuperuserAuditEvent({
      auth,
      action: "superuser.revoked",
      target: {
        sId: result.value.targetSId,
        name: result.value.targetName,
      },
      previousState: result.value.previousState,
      currentState: result.value.newState,
      outcome: "success",
      rolesWritten: true,
      dbUpdated: result.value.previousState.isDustSuperUser,
      currentDriftState: "none",
      remediation: "",
    });

    return ctx.json({ result: result.value });
  }
);

// ---------------------------------------------------------------------------
// PATCH /:userSId/roles — Update superuser roles
// ---------------------------------------------------------------------------

/** @ignoreswagger */
app.patch(
  "/:userSId/roles",
  validate("json", UpdateRolesBodySchema),
  async (
    ctx
  ): HandlerResult<
    SuperuserMutationResponse | SuperuserPartialFailureResponse
  > => {
    const denied = adminCheck(ctx);
    if (denied) {
      return denied;
    }

    const { auth, error } = await resolveAuth(ctx);
    if (!auth) {
      return error;
    }

    const user = await UserResource.fetchById(ctx.req.param("userSId"));
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "User not found.",
        },
      });
    }

    const { roles, generation } = ctx.req.valid("json");

    const result = await updateSuperuserRoles(
      auth,
      user.email,
      roles,
      generation
    );
    if (result.isErr()) {
      return mapMutationError(ctx, result.error);
    }

    emitSuperuserAuditEvent({
      auth,
      action: "superuser.roles_updated",
      target: {
        sId: result.value.targetSId,
        name: result.value.targetName,
      },
      previousState: result.value.previousState,
      currentState: result.value.newState,
      outcome: "success",
      rolesWritten: true,
      dbUpdated: false,
      currentDriftState: "ok",
      remediation: "",
    });

    return ctx.json({ result: result.value });
  }
);

// ---------------------------------------------------------------------------
// POST /:userSId/repair — Repair drift between DB and GCS
// ---------------------------------------------------------------------------

/** @ignoreswagger */
app.post(
  "/:userSId/repair",
  validate("json", RepairBodySchema),
  async (
    ctx
  ): HandlerResult<
    SuperuserMutationResponse | SuperuserPartialFailureResponse
  > => {
    const denied = adminCheck(ctx);
    if (denied) {
      return denied;
    }

    const { auth, error } = await resolveAuth(ctx);
    if (!auth) {
      return error;
    }

    const user = await UserResource.fetchById(ctx.req.param("userSId"));
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "User not found.",
        },
      });
    }

    const { generation, roles } = ctx.req.valid("json");

    const result = await repairSuperuserDrift(
      auth,
      user.email,
      generation,
      roles
    );
    if (result.isErr()) {
      return mapMutationError(ctx, result.error);
    }

    const prev = result.value.previousState;
    const driftState =
      prev.isDustSuperUser && prev.pokeRoles.length === 0
        ? "db_only"
        : "roles_only";

    emitSuperuserAuditEvent({
      auth,
      action: "superuser.drift_repaired",
      target: {
        sId: result.value.targetSId,
        name: result.value.targetName,
      },
      previousState: result.value.previousState,
      currentState: result.value.newState,
      outcome: "success",
      rolesWritten: driftState === "db_only",
      dbUpdated: driftState === "roles_only",
      currentDriftState: "ok",
      remediation: "",
    });

    return ctx.json({ result: result.value });
  }
);

export default app;
