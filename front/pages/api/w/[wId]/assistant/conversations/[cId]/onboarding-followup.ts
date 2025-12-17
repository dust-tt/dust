import type { NextApiRequest, NextApiResponse } from "next";

import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { buildOnboardingFollowUpPrompt } from "@app/lib/api/assistant/onboarding";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { AgentMessageType, WithAPIErrorResponse } from "@app/types";
import { GLOBAL_AGENTS_SID, isString } from "@app/types";

export type PostOnboardingFollowupResponseBody = {
  agentMessages: AgentMessageType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostOnboardingFollowupResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const { cId: conversationId } = req.query;

  if (!isString(conversationId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
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

  const { toolId } = req.body;

  if (!isString(toolId) || !isInternalMCPServerName(toolId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body, `toolId` (valid tool id) is required.",
      },
    });
  }

  const conversationRes = await getConversation(auth, conversationId);

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  const followUpPrompt = buildOnboardingFollowUpPrompt(toolId, {
    username: user.username,
  });

  const messageRes = await postUserMessage(auth, {
    conversation,
    content: followUpPrompt,
    mentions: [
      {
        configurationId: GLOBAL_AGENTS_SID.DUST,
      },
    ],
    context: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
      profilePictureUrl: user.imageUrl,
      origin: "onboarding_conversation",
    },
    skipToolsValidation: false,
  });

  if (messageRes.isErr()) {
    return apiError(req, res, messageRes.error);
  }

  res.status(200).json({
    agentMessages: messageRes.value.agentMessages,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
