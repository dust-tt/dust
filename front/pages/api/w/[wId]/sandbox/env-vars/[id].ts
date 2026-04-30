/** @ignoreswagger */
import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
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

  const { id } = req.query;

  const envVarModelId =
    isString(id) && isResourceSId("sandbox_env_var", id)
      ? getResourceIdFromSId(id)
      : null;
  if (envVarModelId === null) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid sandbox environment variable id.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const envVar = await WorkspaceSandboxEnvVarResource.fetchById(
        auth,
        envVarModelId
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
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
