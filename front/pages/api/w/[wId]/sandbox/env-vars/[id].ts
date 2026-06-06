// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type {
  DeleteWorkspaceSandboxEnvVarResponseBody,
  PatchWorkspaceSandboxEnvVarResponseBody,
} from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { WORKSPACE_SANDBOX_ENV_VAR_KINDS } from "@app/types/sandbox/env_var";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PatchWorkspaceSandboxEnvVarBodySchema = z.object({
  kind: z.enum(WORKSPACE_SANDBOX_ENV_VAR_KINDS).optional(),
  allowedDomains: z.array(z.string()).optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | DeleteWorkspaceSandboxEnvVarResponseBody
      | PatchWorkspaceSandboxEnvVarResponseBody
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

  if (!(await hasFeatureFlag(auth, "sandbox_workspace_admin"))) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message:
          "Sandbox workspace admin configuration is not enabled for this workspace.",
      },
    });
  }

  const { id } = req.query;
  if (!isString(id)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid sandbox environment variable id.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const parsed = PatchWorkspaceSandboxEnvVarBodySchema.safeParse(req.body);
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

      const { allowedDomains, kind } = parsed.data;
      if (kind === undefined && allowedDomains === undefined) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "At least one field must be provided.",
          },
        });
      }

      const envVar = await WorkspaceSandboxEnvVarResource.fetchById(auth, id);
      if (!envVar) {
        return apiError(req, res, {
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
        return apiError(req, res, {
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
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "allowedDomains is required when promoting to an HTTPS secret.",
            },
          });
        }

        const promoteResult = await envVar.promoteToHttpsSecret(auth, {
          allowedDomains,
          context: getAuditLogContext(auth, req),
        });
        if (promoteResult.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: promoteResult.error.message,
            },
          });
        }

        return res.status(200).json({ envVar: promoteResult.value.toJSON() });
      }

      if (allowedDomains !== undefined) {
        const updateResult = await envVar.updateAllowedDomains(auth, {
          allowedDomains,
          context: getAuditLogContext(auth, req),
        });
        if (updateResult.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateResult.error.message,
            },
          });
        }

        return res.status(200).json({ envVar: updateResult.value.toJSON() });
      }

      return res.status(200).json({ envVar: envVar.toJSON() });
    }

    case "DELETE": {
      const envVar = await WorkspaceSandboxEnvVarResource.fetchById(auth, id);
      if (!envVar) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Sandbox environment variable not found.",
          },
        });
      }

      const deleteResult = await envVar.delete(auth, {
        context: getAuditLogContext(auth, req),
      });
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: deleteResult.error.message,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, DELETE or PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
