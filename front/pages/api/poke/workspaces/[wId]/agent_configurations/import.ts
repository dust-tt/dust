import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@app/types/api/internal/agent_configuration";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * @ignoreswagger
 * Internal endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ assistant: AgentConfigurationType }>
  >,
  session: SessionWithUser
) {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

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

  const bodyValidation =
    PostOrPatchAgentConfigurationRequestBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyValidation.error.message}`,
      },
    });
  }
  const body = bodyValidation.data;

  const result = await createOrUpgradeAgentConfiguration({
    auth,
    assistant: body.assistant,
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

  res.status(200).json({ assistant: result.value });
}

export default withSessionAuthenticationForPoke(handler);
