import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RichMention } from "@app/types/assistant/mentions";
import { isString } from "@app/types/shared/utils/general";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type MentionSuggestionsResponseBody = {
  suggestions: RichMention[];
};

const MentionSuggestionsQuerySchema = z.object({
  query: z.string().optional().default(""),
  select: z.union([z.string(), z.array(z.string())]).optional(),
  current: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/mentions/suggestions.
const app = new Hono();

app.get(
  "/",
  validate("query", MentionSuggestionsQuerySchema),
  async (ctx): HandlerResult<MentionSuggestionsResponseBody> => {
    const auth = ctx.get("auth");
    const cId = ctx.req.param("cId") ?? "";

    const conversationRes = await ConversationResource.fetchById(auth, cId);
    if (!conversationRes) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found",
        },
      });
    }

    const spaceId = conversationRes.space?.sId;

    const {
      query: queryParam,
      select: selectParam,
      current,
    } = ctx.req.valid("query");
    const query = isString(queryParam) ? queryParam.trim().toLowerCase() : "";

    // Parse select parameter: can be "agents", "users", or array.
    const select = (() => {
      if (!selectParam) {
        return { agents: true, users: true };
      }

      const selectValues = isString(selectParam) ? [selectParam] : selectParam;
      const agents = selectValues.includes("agents");
      const users = selectValues.includes("users");

      return { agents, users };
    })();

    const suggestions = await suggestionsOfMentions(auth, {
      query,
      conversationId: cId,
      select,
      current: current === "true",
      spaceId,
    });

    return ctx.json({ suggestions });
  }
);

export default app;
