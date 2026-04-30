/** @ignoreswagger */
import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { PostWorkspaceSandboxEnvVarBodySchema } from "@app/lib/api/sandbox/env_vars";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { WorkspaceSandboxEnvVarType } from "@app/types/sandbox/env_var";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetWorkspaceSandboxEnvVarsResponseBody = {
  envVars: WorkspaceSandboxEnvVarType[];
};

export type PostWorkspaceSandboxEnvVarsResponseBody = {
  envVar: WorkspaceSandboxEnvVarType;
  created: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetWorkspaceSandboxEnvVarsResponseBody
      | PostWorkspaceSandboxEnvVarsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only workspace admins can manage sandbox environment variables.",
      },
    });
  }

  if (!(await hasFeatureFlag(auth, "sandbox_tools"))) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "Sandbox tools are not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const envVars =
        await WorkspaceSandboxEnvVarResource.listForWorkspace(auth);

      return res.status(200).json({
        envVars: envVars.map((envVar) => envVar.toJSON()),
      });
    }

    case "POST": {
      const parsed = PostWorkspaceSandboxEnvVarBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: parsed.error.issues
              .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
              .join("; "),
          },
        });
      }

      const result = await WorkspaceSandboxEnvVarResource.upsert(auth, {
        name: parsed.data.name,
        value: parsed.data.value,
        context: getAuditLogContext(auth, req),
      });
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      }

      return res.status(result.value.created ? 201 : 200).json({
        envVar: result.value.resource.toJSON(),
        created: result.value.created,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
