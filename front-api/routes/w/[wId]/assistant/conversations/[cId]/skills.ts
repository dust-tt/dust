import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const ConversationSkillActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  skillId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/skills.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }

  const conversationSkills = await SkillResource.listEnabledByConversation(
    auth,
    { conversation: conversationRes.value }
  );

  return c.json({ skills: conversationSkills.map((s) => s.toJSON(auth)) });
});

app.post(
  "/",
  validate("json", ConversationSkillActionRequestSchema),
  async (c) => {
    const auth = c.get("auth");
    const conversationId = c.req.param("cId") ?? "";

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );
    if (conversationRes.isErr()) {
      return apiErrorForConversation(c, conversationRes.error);
    }

    const conversationWithoutContent = conversationRes.value;
    const { action, skillId } = c.req.valid("json");

    const skillRes = await SkillResource.fetchById(auth, skillId);

    if (!skillRes) {
      logger.error(
        {
          skillId,
          conversationId,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Skill not found"
      );
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: "Skill not found",
        },
      });
    }

    const r = await SkillResource.upsertConversationSkills(auth, {
      conversationId: conversationWithoutContent.id,
      skills: [skillRes],
      enabled: action === "add",
    });
    if (r.isErr()) {
      logger.error(
        {
          error: r.error,
          skillId,
          conversationId,
          action,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Failed to upsert skill to conversation"
      );
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to add skill to conversation",
        },
      });
    }

    return c.json({ success: true });
  }
);

export default app;
