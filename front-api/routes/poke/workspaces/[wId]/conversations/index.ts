import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type {
  ConversationVisibility,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import conversationId from "./[cId]";

export type PokeListConversationItem = ConversationWithoutContentType & {
  visibility?: ConversationVisibility;
};

export type PokeListConversations = {
  conversations: PokeListConversationItem[];
};

const ListConversationsQuerySchema = z.object({
  agentId: z.string().optional(),
  triggerId: z.string().optional(),
  reinforcedSkillId: z.string().optional(),
});

// Mounted at /api/poke/workspaces/:wId/conversations.
const app = pokeApp();

app.get(
  "/",
  validate("query", ListConversationsQuerySchema),
  async (ctx): HandlerResult<PokeListConversations> => {
    const auth = ctx.get("auth");
    const { agentId, triggerId, reinforcedSkillId } = ctx.req.valid("query");

    let conversations: PokeListConversationItem[];

    if (triggerId) {
      conversations = await ConversationResource.listConversationsForTrigger(
        auth,
        triggerId
      );
    } else if (reinforcedSkillId) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      conversations =
        await ConversationResource.listSkillReinforcementConversations(
          auth,
          reinforcedSkillId,
          { after: oneWeekAgo }
        );
    } else if (agentId) {
      const conversationResources =
        await ConversationResource.listConversationWithAgentCreatedBeforeDate(
          auth,
          {
            agentConfigurationId: agentId,
            cutoffDate: new Date(),
          },
          { includeDeleted: true }
        );

      conversations = conversationResources.map((c) => ({
        id: c.id,
        created: c.createdAt.getTime(),
        updated: c.updatedAt.getTime(),
        sId: c.sId,
        owner: auth.getNonNullableWorkspace(),
        title: c.title,
        visibility: c.visibility,
        depth: c.depth,
        triggerId: c.triggerSId,
        actionRequired: false,
        unread: false,
        lastReadMs: Date.now(),
        hasError: c.hasError,
        requestedSpaceIds: c.getRequestedSpaceIdsFromModel(),
        spaceId: c.space?.sId ?? null,
        metadata: c.metadata,
        branchId: null,
        isRunningAgentLoop: c.isRunningAgentLoop,
      }));

      conversations.sort((a, b) => b.created - a.created);
    } else {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Either agent ID, reinforcedSkill ID or trigger ID is required.",
        },
      });
    }

    return ctx.json({ conversations });
  }
);

app.route("/:cId", conversationId);

export default app;
