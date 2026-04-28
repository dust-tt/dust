/** @ignoreswagger */
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export type GetWorkspaceSandboxAgentEgressRequestsResponseBody = {
  allowAgentEgressRequests: boolean;
};

export type PutWorkspaceSandboxAgentEgressRequestsResponseBody = {
  allowAgentEgressRequests: boolean;
};

const UpdateSandboxAgentEgressRequestsBodySchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetWorkspaceSandboxAgentEgressRequestsResponseBody
      | PutWorkspaceSandboxAgentEgressRequestsResponseBody
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
      const result =
        await WorkspaceResource.fetchSandboxAllowAgentEgressRequests(owner.sId);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to read sandbox agent egress request setting: ${result.error.message}`,
          },
        });
      }

      return res.status(200).json({
        allowAgentEgressRequests: result.value,
      });
    }

    case "PUT": {
      const parsedBody = UpdateSandboxAgentEgressRequestsBodySchema.safeParse(
        req.body
      );
      if (!parsedBody.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid sandbox agent egress request setting: expected { enabled: boolean }.",
          },
        });
      }

      const result =
        await WorkspaceResource.updateSandboxAllowAgentEgressRequests(
          owner.id,
          parsedBody.data.enabled
        );
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to update sandbox agent egress request setting: ${result.error.message}`,
          },
        });
      }

      void emitAuditLogEvent({
        auth,
        action: "sandbox_egress_policy.agent_requests_setting_updated",
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
          enabled: String(parsedBody.data.enabled),
        },
      });

      return res.status(200).json({
        allowAgentEgressRequests: parsedBody.data.enabled,
      });
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
