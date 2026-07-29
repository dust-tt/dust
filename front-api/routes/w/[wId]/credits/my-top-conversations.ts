import { fetchTopConversationsByCredits } from "@app/lib/api/assistant/observability/credit_usage";
import { daysToInstantRange } from "@app/lib/api/assistant/observability/utils";
import type { GetMyTopConversationsResponseBody } from "@app/types/api/credits/my_top_conversations";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

const TOP_CONVERSATIONS_DAYS = 30;
const TOP_CONVERSATIONS_LIMIT = 10;

// Mounted at /api/w/:wId/credits/my-top-conversations.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const { startDate, endDate } = daysToInstantRange(
    TOP_CONVERSATIONS_DAYS,
    "UTC"
  );

  const result = await fetchTopConversationsByCredits(auth, {
    startDate,
    endDate,
    limit: TOP_CONVERSATIONS_LIMIT,
    userIds: [auth.getNonNullableUser().sId],
  });
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }

  const body: GetMyTopConversationsResponseBody = {
    conversations: result.value,
  };
  return ctx.json(body);
});

export default app;
