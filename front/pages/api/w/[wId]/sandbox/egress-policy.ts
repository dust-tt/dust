/** @ignoreswagger */
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  readWorkspacePolicy,
  writeWorkspacePolicy,
} from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { parseEgressPolicy } from "@app/types/sandbox/egress_policy";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type PutWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetWorkspaceEgressPolicyResponseBody
      | PutWorkspaceEgressPolicyResponseBody
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
        message: "Only workspace admins can manage sandbox network settings.",
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
      const result = await readWorkspacePolicy(owner.sId);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to read sandbox egress policy: ${result.error.message}`,
          },
        });
      }

      return res.status(200).json({ policy: result.value });
    }

    case "PUT": {
      const parsedPolicy = parseEgressPolicy(req.body);
      if (parsedPolicy.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid sandbox egress policy: ${parsedPolicy.error.message}`,
          },
        });
      }

      const result = await writeWorkspacePolicy({
        workspaceId: owner.sId,
        policy: parsedPolicy.value,
      });
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to write sandbox egress policy: ${result.error.message}`,
          },
        });
      }

      void emitAuditLogEvent({
        auth,
        action: "sandbox_egress_policy.updated",
        targets: [
          buildAuditLogTarget("workspace", owner),
          {
            type: "sandbox_egress_policy",
            id: owner.sId,
            name: "Sandbox egress policy",
          },
        ],
        context: getAuditLogContext(auth, req),
        metadata: {
          allowedDomainCount: String(result.value.allowedDomains.length),
          allowedDomains: result.value.allowedDomains.join(","),
        },
      });

      return res.status(200).json({ policy: result.value });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PUT is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
