// @migration-status: MIGRATED_TO_HONO
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { verifySandboxExecToken } from "@app/lib/api/sandbox/access_tokens";
import { createSandboxChildAction } from "@app/lib/api/sandbox/create_child_action";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { CallMCPToolRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

type CallSandboxToolResponse = {
  status: "pending";
  actionId: string;
};

/**
 * @ignoreswagger
 * internal endpoint
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CallSandboxToolResponse>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The request does not have valid authentication credentials.",
      },
    });
  }

  const claims = await verifySandboxExecToken(token);
  if (!claims) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_sandbox_token_error",
        message: "The sandbox token is invalid or expired.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sandbox_dsbx_tools")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Sandbox dsbx tools are not enabled for this workspace.",
      },
    });
  }

  const bodyRes = CallMCPToolRequestBodySchema.safeParse(req.body);
  if (!bodyRes.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyRes.error.message}`,
      },
    });
  }

  const { serverViewId, toolName, arguments: toolArgs } = bodyRes.data;

  const result = await createSandboxChildAction(auth, {
    parentActionId: claims.actionId,
    agentId: claims.aId,
    conversationId: claims.cId,
    agentMessageId: claims.mId,
    serverViewId,
    toolName,
    rawInputs: toolArgs ?? {},
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

  const { actionId, pauseSandbox } = result.value;

  res.status(202).json({ status: "pending", actionId });

  // Pause the sandbox only AFTER the response is handed to the runtime.
  // `betaPause` freezes the in-sandbox `dsbx` client that issued this request,
  // and `dsbx` must receive `actionId` to start polling for the result. We
  // fire the pause without awaiting (the response is already sent) and it sits
  // behind a lock + several DB round-trips before `provider.sleep`, so in
  // practice the response is on the wire before the sandbox freezes.
  if (pauseSandbox) {
    void pauseSandbox().catch((err) =>
      logger.error(
        { err, actionId },
        "Failed to pause sandbox for blocked sandbox-child"
      )
    );
  }
}

export default withPublicAPIAuthentication(handler);
