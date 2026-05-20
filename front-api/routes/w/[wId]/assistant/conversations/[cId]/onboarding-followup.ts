import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { buildOnboardingFollowUpPrompt } from "@app/lib/api/assistant/onboarding";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isString } from "@app/types/shared/utils/general";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";

import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/:cId/onboarding-followup.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");
  const user = auth.getNonNullableUser();
  const conversationId = c.req.param("cId") ?? "";

  const body = await c.req.json().catch(() => ({}));
  const { toolId } = body;

  if (!isString(toolId) || !isInternalMCPServerName(toolId)) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body, `toolId` (valid tool id) is required.",
      },
    });
  }

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }

  const conversation = conversationRes.value;

  // Extract user's preferred language from Accept-Language header.
  const acceptLanguage = c.req.header("accept-language");
  const language = acceptLanguage?.split(",")[0]?.split("-")[0] ?? null;

  const followUpPrompt = buildOnboardingFollowUpPrompt(toolId, language);

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
    return apiError(c, messageRes.error);
  }

  return c.json({ agentMessages: messageRes.value.agentMessages });
});

export default app;
