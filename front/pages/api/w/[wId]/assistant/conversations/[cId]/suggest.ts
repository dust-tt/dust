/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type SuggestResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SuggestResponseBody>>,
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
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

  // Keep endpoint alive for backward compatibility with older clients while
  // removing the underlying suggestion feature.
  void auth;
  void conversation;

  res.status(200).json({
    agentConfigurations: [],
  });
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} })
);
