import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

export type GetAgentMessageSkillsResponseBody = {
  skills: SkillType[];
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/skills.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetAgentMessageSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { cId, mId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const messageRes = await conversation.getMessageById(auth, mId);
    if (messageRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "message_not_found",
          message: "Message not found.",
        },
      });
    }

    if (!messageRes.value.agentMessageId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Message is not an agent message.",
        },
      });
    }

    const skills = await SkillResource.listByAgentMessageId(
      auth,
      messageRes.value.agentMessageId
    );

    return ctx.json({
      skills: skills.map((skill) => skill.toJSON(auth)),
    });
  }
);

export default app;
