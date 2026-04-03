/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

export type SuggestResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};

const SuggestQuerySchema = t.type({
  cId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SuggestResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const queryValidation = SuggestQuerySchema.decode(req.query);
  if (isLeft(queryValidation)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters",
      },
    });
  }

  // Keep endpoint alive for backward compatibility with older clients while
  // removing the underlying suggestion feature.
  void auth;
  void queryValidation.right;

  res.status(200).json({
    agentConfigurations: [],
  });
}

export default withSessionAuthenticationForWorkspace(handler);
