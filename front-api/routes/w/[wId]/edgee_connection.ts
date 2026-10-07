import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { EdgeeConnectionResource } from "@app/lib/resources/edgee_connection_resource";
import type {
  GetEdgeeConnectionResponseBody,
  PutEdgeeConnectionResponseBody,
} from "@app/types/gateways/edgee";
import { EdgeeConnectionBodySchema } from "@app/types/gateways/edgee";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";

function notEdgeeWorkspaceError(ctx: Context) {
  return apiError(ctx, {
    status_code: 403,
    api_error: {
      type: "app_auth_error",
      message: "This workspace's plan is not routed through Edgee.",
    },
  });
}

// Mounted at /api/w/:wId/edgee_connection.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetEdgeeConnectionResponseBody> => {
    const auth = ctx.get("auth");
    if (auth.getNonNullablePlan().gateway !== "edgee") {
      return notEdgeeWorkspaceError(ctx);
    }

    const connection = await EdgeeConnectionResource.fetch(auth);
    return ctx.json({ connection: connection?.toJSON() ?? null });
  }
);

/** @ignoreswagger */
app.put(
  "/",
  ensureIsAdmin(),
  validate("json", EdgeeConnectionBodySchema),
  async (ctx): HandlerResult<PutEdgeeConnectionResponseBody> => {
    const auth = ctx.get("auth");
    if (auth.getNonNullablePlan().gateway !== "edgee") {
      return notEdgeeWorkspaceError(ctx);
    }

    const existing = await EdgeeConnectionResource.fetch(auth);
    const res = await EdgeeConnectionResource.upsert(
      auth,
      ctx.req.valid("json")
    );
    if (res.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Edgee refused this token for the organization, check both values.",
        },
      });
    }

    const connection = res.value;
    void emitAuditLogEvent({
      auth,
      action: existing ? "credentials.updated" : "credentials.created",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("credential", {
          sId: connection.sId,
          name: "edgee",
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: { provider_id: "edgee" },
    });

    return ctx.json({ connection: connection.toJSON() });
  }
);

/** @ignoreswagger */
app.delete("/", ensureIsAdmin(), async (ctx) => {
  const auth = ctx.get("auth");
  if (auth.getNonNullablePlan().gateway !== "edgee") {
    return notEdgeeWorkspaceError(ctx);
  }

  const connection = await EdgeeConnectionResource.fetch(auth);
  if (!connection) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "provider_not_found",
        message: "No Edgee connection is configured for this workspace.",
      },
    });
  }

  const deleteRes = await connection.delete(auth);
  if (deleteRes.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to remove the Edgee connection.",
      },
    });
  }

  void emitAuditLogEvent({
    auth,
    action: "credentials.revoked",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("credential", {
        sId: connection.sId,
        name: "edgee",
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: { provider_id: "edgee", reason: "user_deleted" },
  });

  return ctx.body(null, 204);
});

export default app;
