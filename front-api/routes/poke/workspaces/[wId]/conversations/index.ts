import type {
  PokeListConversationItem,
  PokeListConversations,
} from "@app/lib/api/poke/conversations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import conversationId from "./[cId]";

const ListConversationsQuerySchema = z.object({
  agentId: z.string().optional(),
  triggerId: z.string().optional(),
  reinforcedSkillId: z.string().optional(),
  // Only honored on the agent branch: the trigger and reinforced-skill listings are
  // already bounded by their own scope.
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  orderColumn: z
    .enum(["createdAt", "title", "sId"])
    .optional()
    .default("createdAt"),
  orderDirection: z.enum(["asc", "desc"]).optional().default("desc"),
  // Inclusive `createdAt` day bounds, as YYYY-MM-DD interpreted in UTC.
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function utcMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function nextUtcMidnight(day: string): Date {
  const date = utcMidnight(day);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

// Mounted at /api/poke/workspaces/:wId/conversations.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", ListConversationsQuerySchema),
  async (ctx): HandlerResult<PokeListConversations> => {
    const auth = ctx.get("auth");
    const {
      agentId,
      triggerId,
      reinforcedSkillId,
      limit,
      offset,
      orderColumn,
      orderDirection,
      from,
      to,
    } = ctx.req.valid("query");

    let conversations: PokeListConversationItem[];
    let totalCount: number;

    if (triggerId) {
      conversations = await ConversationResource.listConversationsForTrigger(
        auth,
        triggerId
      );
      totalCount = conversations.length;
    } else if (reinforcedSkillId) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      conversations =
        await ConversationResource.listSkillReinforcementConversations(
          auth,
          reinforcedSkillId,
          { after: oneWeekAgo }
        );
      totalCount = conversations.length;
    } else if (agentId) {
      const {
        conversations: conversationResources,
        totalCount: totalCountForAgent,
      } = await ConversationResource.listConversationsWithAgentPaginated(
        auth,
        {
          agentConfigurationId: agentId,
          limit,
          offset,
          orderColumn,
          orderDirection,
          createdAfter: from ? utcMidnight(from) : undefined,
          // `to` names the last day to include, so the exclusive upper bound is the
          // midnight that follows it.
          createdBefore: to ? nextUtcMidnight(to) : undefined,
        },
        { includeDeleted: true }
      );

      totalCount = totalCountForAgent;
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
        isRunningAgentLoop: c.isRunningAgentLoop,
      }));
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

    return ctx.json({ conversations, totalCount });
  }
);

app.route("/:cId", conversationId);

export default app;
