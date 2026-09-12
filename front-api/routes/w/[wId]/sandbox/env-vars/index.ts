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
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import envVarId from "./[id]";
import bulk from "./bulk";

const PostWorkspaceSandboxEnvVarBodySchema = z.object({
  name: z.string(),
  value: z.string(),
  kind: z.enum(SANDBOX_ENV_VAR_KINDS).optional(),
  allowedDomains: z.array(z.string()).nullable().optional(),
});

// Mounted at /api/w/:wId/sandbox/env-vars.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetSandboxEnvVarsResponseBody> => {
  const auth = ctx.get("auth");

  const envVars = await SandboxEnvVarResource.listForScope(auth, {
    kind: "workspace",
    workspace: auth.getNonNullableWorkspace(),
  });

  return ctx.json({
    envVars: envVars.map((envVar) => envVar.toJSON()),
  });
});

app.post(
  "/",
  validate("json", PostWorkspaceSandboxEnvVarBodySchema),
  async (ctx): HandlerResult<PostSandboxEnvVarsResponseBody> => {
    const auth = ctx.get("auth");
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
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
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

app.route("/bulk", bulk);
app.route("/:id", envVarId);

export default app;
