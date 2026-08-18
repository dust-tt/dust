import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  deleteSandboxEnvVarForScopes,
  parseSandboxAdminPodSelection,
  resolveSandboxAdminPods,
  SandboxAdminPodSelectionQuerySchema,
  upsertSandboxEnvVarForPods,
} from "@app/lib/api/sandbox/admin_pods";
import {
  normalizeAllowedDomainsForKind,
  parseSandboxEnvVarNameForKind,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import type {
  DeleteSandboxEnvVarsBulkResponseBody,
  GetSandboxEnvVarsBulkResponseBody,
  PostSandboxEnvVarsBulkResponseBody,
} from "@app/types/api/sandbox/env_vars";
import { SANDBOX_ENV_VAR_KINDS } from "@app/types/sandbox/env_var";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

const PostSandboxEnvVarsBulkBodySchema = z.object({
  name: z.string(),
  value: z.string(),
  kind: z.enum(SANDBOX_ENV_VAR_KINDS).optional(),
  allowedDomains: z.array(z.string()).nullable().optional(),
  podIds: z.array(z.string()).min(1).max(100),
});

const DeleteSandboxEnvVarsBulkBodySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(SANDBOX_ENV_VAR_KINDS),
  includeWorkspace: z.boolean(),
  podIds: z.array(z.string()).max(100),
});

// Mounted at /api/w/:wId/sandbox/env-vars/bulk. Multi-pod reads and writes for
// the central Computer admin page. The parent sub-app applies the
// workspace-admin + Computer gates; the multi-Pod feature is gated on the
// Pod Functions (sandbox_functions) flag. Values are never returned
// (write-only invariant).
const app = workspaceApp();

app.use("*", withFeatureFlag("sandbox_functions"));

/** @ignoreswagger */
app.get(
  "/",
  validate("query", SandboxAdminPodSelectionQuerySchema),
  async (ctx): HandlerResult<GetSandboxEnvVarsBulkResponseBody> => {
    const auth = ctx.get("auth");

    const selection = parseSandboxAdminPodSelection(ctx.req.valid("query"));
    if (selection.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: selection.error.message,
        },
      });
    }

    const pods = await resolveSandboxAdminPods(auth, selection.value);
    const envVars = await SandboxEnvVarResource.listForPods(auth, pods);

    return ctx.json({
      envVars: envVars.map((envVar) => envVar.toJSON()),
    });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostSandboxEnvVarsBulkBodySchema),
  async (ctx): HandlerResult<PostSandboxEnvVarsBulkResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    // The payload is validated once, before any write; per-pod outcomes in
    // the response only reflect per-pod conditions (unknown pod, cap, kind
    // mismatch with an existing row).
    const kind = body.kind ?? "config";
    const parsedName = parseSandboxEnvVarNameForKind({
      kind,
      name: body.name,
    });
    const parsedValue = validateEnvVarValueForKind({
      kind,
      value: body.value,
    });
    if (parsedName.isErr() || parsedValue.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: [
            parsedName.isErr() ? `name: ${parsedName.error}` : null,
            parsedValue.isErr() ? `value: ${parsedValue.error}` : null,
          ]
            .filter((message) => message !== null)
            .join("; "),
        },
      });
    }

    // `undefined` stays `undefined` (replace flows keep each pod row's
    // stored domains); provided domains are normalized and rejected here if
    // invalid, so the per-pod loop never fails on them.
    const normalizedDomains = normalizeAllowedDomainsForKind({
      kind,
      allowedDomains: body.allowedDomains,
      requiredForSecret: false,
    });
    if (normalizedDomains.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: normalizedDomains.error.message,
        },
      });
    }

    const results = await upsertSandboxEnvVarForPods(auth, {
      podIds: [...new Set(body.podIds)],
      name: parsedName.value,
      value: body.value,
      kind,
      allowedDomains: normalizedDomains.value,
      context: getAuditLogContext(auth),
    });

    return ctx.json({ results });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  validate("json", DeleteSandboxEnvVarsBulkBodySchema),
  async (ctx): HandlerResult<DeleteSandboxEnvVarsBulkResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    // Rows are stored under the suffix; accept the prefixed wire name and
    // strip it, rejecting a prefix that disagrees with the kind.
    const parsedName = parseSandboxEnvVarNameForKind({
      kind: body.kind,
      name: body.name,
    });
    if (parsedName.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `name: ${parsedName.error}`,
        },
      });
    }

    const results = await deleteSandboxEnvVarForScopes(auth, {
      name: parsedName.value,
      includeWorkspace: body.includeWorkspace,
      podIds: [...new Set(body.podIds)],
      context: getAuditLogContext(auth),
    });

    return ctx.json({ results });
  }
);

export default app;
