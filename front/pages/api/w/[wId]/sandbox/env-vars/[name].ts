/** @ignoreswagger */
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { validateEnvVarName } from "@app/lib/api/sandbox/env_vars";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type DeleteWorkspaceSandboxEnvVarResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<DeleteWorkspaceSandboxEnvVarResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

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

  const { name } = req.query;

  if (!isString(name)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Expected a string environment variable name.",
      },
    });
  }

  const nameValidation = validateEnvVarName(name);
  if (nameValidation.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: nameValidation.error,
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const envVar = await WorkspaceSandboxEnvVarResource.fetchByName(
        auth,
        name
      );
      if (!envVar) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Sandbox environment variable not found.",
          },
        });
      }

      const deleteResult = await envVar.delete(auth);
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: deleteResult.error.message,
          },
        });
      }

      void emitAuditLogEvent({
        auth,
        action: "sandbox_env_var.deleted",
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("sandbox_env_var", {
            sId: `${owner.sId}:${name}`,
            name,
          }),
        ],
        context: getAuditLogContext(auth, req),
        metadata: {
          name,
        },
      });

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
