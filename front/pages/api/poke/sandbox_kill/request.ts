// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { SandboxKillRequestResponseBody } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import { launchSandboxKillRequesterWorkflow } from "@app/temporal/sandbox_reaper/kill_requester/client";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const RequestBodySchema = z.object({
  baseImage: z.string().min(1),
  version: z.string().optional(),
});

function buildTemporalLink(workflowId: string): string {
  const temporalNamespace = config.getTemporalFrontNamespace() ?? "";
  return `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${encodeURIComponent(
    workflowId
  )}`;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SandboxKillRequestResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const payload = RequestBodySchema.safeParse(req.body);
  if (!payload.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `The request body is invalid: ${fromError(payload.error).toString()}`,
      },
    });
  }

  const launched = await launchSandboxKillRequesterWorkflow(payload.data);
  if (launched.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to launch sandbox kill requester workflow: ${launched.error.message}`,
      },
    });
  }

  return res.status(200).json({
    workflowId: launched.value.workflowId,
    temporalLink: buildTemporalLink(launched.value.workflowId),
  });
}

export default withSessionAuthenticationForPoke(handler);
