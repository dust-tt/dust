import type {
  AgentConfigurationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import { createOrUpgradeAgentConfiguration } from "@app/pages/api/w/[wId]/assistant/agent_configurations";

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
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = PostOrPatchAgentConfigurationRequestBodySchema.decode(
    req.body
  );
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }
  const body = bodyValidation.right;

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

export default withSessionAuthentication(handler);
