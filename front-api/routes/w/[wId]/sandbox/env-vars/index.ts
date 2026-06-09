import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import type {
  GetWorkspaceSandboxEnvVarsResponseBody,
  PostWorkspaceSandboxEnvVarsResponseBody,
} from "@app/lib/api/sandbox/env_vars";
import {
  parseWorkspaceSandboxEnvVarNameForKind,
  validateEnvVarValueForKind,
} from "@app/lib/api/sandbox/env_vars";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { WORKSPACE_SANDBOX_ENV_VAR_KINDS } from "@app/types/sandbox/env_var";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import envVarId from "./[id]";

const PostWorkspaceSandboxEnvVarBodySchema = z.object({
  name: z.string(),
  value: z.string(),
  kind: z.enum(WORKSPACE_SANDBOX_ENV_VAR_KINDS).optional(),
  allowedDomains: z.array(z.string()).nullable().optional(),
});

// Mounted at /api/w/:wId/sandbox/env-vars.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceSandboxEnvVarsResponseBody> => {
    const auth = ctx.get("auth");

    const envVars = await WorkspaceSandboxEnvVarResource.listForWorkspace(auth);

    return ctx.json({
      envVars: envVars.map((envVar) => envVar.toJSON()),
    });
  }
);

app.post(
  "/",
  validate("json", PostWorkspaceSandboxEnvVarBodySchema),
  async (ctx): HandlerResult<PostWorkspaceSandboxEnvVarsResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const kind = body.kind ?? "config";
    const parsedName = parseWorkspaceSandboxEnvVarNameForKind({
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

    const result = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: parsedName.value,
      value: body.value,
      kind,
      allowedDomains: body.allowedDomains,
      context: getAuditLogContext(auth),
    });
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
