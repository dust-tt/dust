import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import type { PatchSandboxEnvVarResponseBody } from "@app/lib/resources/sandbox_env_var_resource";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { SANDBOX_ENV_VAR_KINDS } from "@app/types/sandbox/env_var";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const PatchPodSandboxEnvVarBodySchema = z
  .object({
    kind: z.enum(SANDBOX_ENV_VAR_KINDS).optional(),
    allowedDomains: z.array(z.string()).optional(),
  })
  .refine(
    (body) => body.kind !== undefined || body.allowedDomains !== undefined,
    { message: "At least one field must be provided." }
  );

const ParamsSchema = z.object({
  id: z.string(),
});

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox/env-vars/:id.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  ensureIsAdmin(),
  withSpace({ requireProject: true, requireCanReadOrAdministrate: true }),
  validate("param", ParamsSchema),
  validate("json", PatchPodSandboxEnvVarBodySchema),
  async (ctx): HandlerResult<PatchSandboxEnvVarResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { id } = ctx.req.valid("param");

    const { allowedDomains, kind } = ctx.req.valid("json");

    const scope = { kind: "pod" as const, pod: space };
    // Scope-filtered: workspace-scoped rows and rows of other pods resolve
    // to null here.
    const envVar = await SandboxEnvVarResource.fetchById(auth, scope, id);
    if (!envVar) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox environment variable not found.",
        },
      });
    }

    // Phase 1 only permits one-way promotion. Demoting an HTTPS secret back
    // to config would put the real value back into the agent environment.
    if (kind === "config" && envVar.kind === "https_secret") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Demoting an HTTPS secret to a config environment variable is not supported.",
        },
      });
    }

    if (kind === "https_secret" && envVar.kind === "config") {
      if (allowedDomains === undefined) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "allowedDomains is required when promoting to an HTTPS secret.",
          },
        });
      }

      const promoteResult = await envVar.promoteToHttpsSecret(auth, scope, {
        allowedDomains,
        context: getAuditLogContext(auth),
      });
      if (promoteResult.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: promoteResult.error.message,
          },
        });
      }

      return ctx.json({ envVar: promoteResult.value.toJSON() });
    }

    if (allowedDomains !== undefined) {
      const updateResult = await envVar.updateAllowedDomains(auth, scope, {
        allowedDomains,
        context: getAuditLogContext(auth),
      });
      if (updateResult.isErr()) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: updateResult.error.message,
          },
        });
      }

      return ctx.json({ envVar: updateResult.value.toJSON() });
    }

    return ctx.json({ envVar: envVar.toJSON() });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  withSpace({ requireProject: true, requireCanReadOrAdministrate: true }),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { id } = ctx.req.valid("param");

    // Scope-filtered: workspace-scoped rows and rows of other pods resolve
    // to null here.
    const envVar = await SandboxEnvVarResource.fetchById(
      auth,
      { kind: "pod", pod: space },
      id
    );
    if (!envVar) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox environment variable not found.",
        },
      });
    }

    const deleteResult = await envVar.delete(auth, {
      context: getAuditLogContext(auth),
    });
    if (deleteResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: deleteResult.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
