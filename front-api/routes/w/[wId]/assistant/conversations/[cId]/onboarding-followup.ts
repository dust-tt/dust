import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { buildOnboardingFollowUpPrompt } from "@app/lib/api/assistant/onboarding";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import { isString } from "@app/types/shared/utils/general";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

export type PostOnboardingFollowupResponseBody = {
  agentMessages: AgentMessageType[];
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/onboarding-followup.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PostOnboardingFollowupResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const { cId: conversationId } = ctx.req.valid("param");

    const body = await ctx.req.json().catch(() => ({}));
    const { toolId } = body;

    if (!isString(toolId) || !isInternalMCPServerName(toolId)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Invalid request body, `toolId` (valid tool id) is required.",
        },
      });
    }

    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;

    // Extract user's preferred language from Accept-Language header.
    const acceptLanguage = ctx.req.header("accept-language");
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
      return apiError(ctx, messageRes.error);
    }

    return ctx.json({ agentMessages: messageRes.value.agentMessages });
  }
);

export default app;
