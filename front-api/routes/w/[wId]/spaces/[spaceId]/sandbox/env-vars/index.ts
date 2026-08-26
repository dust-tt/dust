import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import {
  parseSandboxEnvVarNameForKind,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import type {
  GetSandboxEnvVarsResponseBody,
  PostSandboxEnvVarsResponseBody,
} from "@app/types/api/sandbox/env_vars";
import { SANDBOX_ENV_VAR_KINDS } from "@app/types/sandbox/env_var";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

import envVarId from "./[id]";

const PostPodSandboxEnvVarBodySchema = z.object({
  name: z.string(),
  value: z.string(),
  kind: z.enum(SANDBOX_ENV_VAR_KINDS).optional(),
  allowedDomains: z.array(z.string()).nullable().optional(),
});

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox/env-vars. Pods are project
// spaces: non-project spaces have no pod-scoped env vars and 404. Workspace-admin
// only (read and write); the gate on this leaf also covers the mounted /:id.
const app = workspaceApp();

app.use("*", ensureIsAdmin());

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireProject: true, requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetSandboxEnvVarsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const envVars = await SandboxEnvVarResource.listForScope(auth, {
      kind: "pod",
      pod: space,
    });

    return ctx.json({
      envVars: envVars.map((envVar) => envVar.toJSON()),
    });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireProject: true, requireCanReadOrAdministrate: true }),
  validate("json", PostPodSandboxEnvVarBodySchema),
  async (ctx): HandlerResult<PostSandboxEnvVarsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const body = ctx.req.valid("json");

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

    const result = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod: space },
      {
        name: parsedName.value,
        value: body.value,
        kind,
        allowedDomains: body.allowedDomains,
        context: getAuditLogContext(auth),
      }
    );
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json(
      {
        envVar: result.value.resource.toJSON(),
        created: result.value.created,
      },
      result.value.created ? 201 : 200
    );
  }
);

app.route("/:id", envVarId);

export default app;
