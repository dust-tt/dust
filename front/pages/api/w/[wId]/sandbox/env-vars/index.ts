/** @ignoreswagger */
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  validateEnvVarName,
  validateEnvVarValue,
} from "@app/lib/api/sandbox/env_vars";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { WorkspaceSandboxEnvVarType } from "@app/types/sandbox/env_var";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetWorkspaceSandboxEnvVarsResponseBody = {
  envVars: WorkspaceSandboxEnvVarType[];
};

export type PostWorkspaceSandboxEnvVarsResponseBody = {
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

  switch (req.method) {
    case "GET": {
      const envVars =
        await WorkspaceSandboxEnvVarResource.listForWorkspace(auth);

      return res.status(200).json({
        envVars: envVars.map((envVar) => envVar.toJSON()),
      });
    }

    case "POST": {
      if (!isString(req.body?.name) || !isString(req.body?.value)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Expected body with string fields name and value.",
          },
        });
      }

      const nameValidation = validateEnvVarName(req.body.name);
      if (nameValidation.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: nameValidation.error,
          },
        });
      }

      const valueValidation = validateEnvVarValue(req.body.value);
      if (valueValidation.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: valueValidation.error,
          },
        });
      }

      const result = await WorkspaceSandboxEnvVarResource.upsert(auth, {
        name: req.body.name,
        value: req.body.value,
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

      const action = result.value.created
        ? "sandbox_env_var.created"
        : "sandbox_env_var.updated";

      void emitAuditLogEvent({
        auth,
        action,
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("sandbox_env_var", {
            sId: `${owner.sId}:${req.body.name}`,
            name: req.body.name,
          }),
        ],
        context: getAuditLogContext(auth, req),
        metadata: {
          name: req.body.name,
          ...(result.value.created
            ? {}
            : {
                previously_existed: "true",
              }),
        },
      });

      return res.status(200).json(result.value);
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
