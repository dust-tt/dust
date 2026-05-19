import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SupportedModel } from "@app/types/assistant/models/types";

export type GetConversationContextUsageResponse = {
  model: SupportedModel | null;
  contextUsage: number | null;
  contextSize: number | null;
};

const PENDING_CONTEXT_USAGE_RESPONSE: GetConversationContextUsageResponse = {
  model: null,
  contextUsage: null,
  contextSize: null,
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/context-usage.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const [lastAgentRun, lastCompactionRun] = await Promise.all([
    conversation.getLatestAgentMessageRun(auth),
    conversation.getLatestCompactionMessageRun(auth),
  ]);

  if (
    lastCompactionRun &&
    lastCompactionRun.rank >= (lastAgentRun?.rank || 0)
  ) {
    // If the latest run is a compaction run we provide a best guess estimate of the context
    // usage with the compaction generated tokens. This misses the system prompt context usage
    // but this will recover at the next agent message and allow us in a somewhat hacky but
    // minimal way to show reduction of context usage as soon as possible.
    const usages = await lastCompactionRun.run.listRunUsages(auth);
    if (usages.length === 0) {
      return c.json(PENDING_CONTEXT_USAGE_RESPONSE);
    }

    const maxUsage = usages.reduce((max, u) =>
      u.completionTokens > max.completionTokens ? u : max
    );

    const modelConfig = getModelConfigByModelId(maxUsage.modelId);

    return c.json({
      model: {
        providerId: maxUsage.providerId,
        modelId: maxUsage.modelId,
      },
      contextUsage: maxUsage.completionTokens,
      contextSize: modelConfig?.contextSize ?? 0,
    });
  }

  if (!lastAgentRun) {
    return c.json(PENDING_CONTEXT_USAGE_RESPONSE);
  }

  let usages = await lastAgentRun.run.listRunUsages(auth);

  if (usages.length === 0) {
    // The latest run has no usage rows yet (still processing). Fall back to the previous
    // completed run so the indicator stays stable instead of dropping to 0%.
    const previousAgentRun = await conversation.getLatestAgentMessageRun(auth, {
      maxRank: lastAgentRun.rank - 1,
    });
    if (previousAgentRun) {
      usages = await previousAgentRun.run.listRunUsages(auth);
    }
  }

  if (usages.length === 0) {
    return c.json(PENDING_CONTEXT_USAGE_RESPONSE);
  }

  // Take the max promptTokens across usages of the run — this represents the peak
  // context usage as seen by the model.
  const maxUsage = usages.reduce((max, u) =>
    u.promptTokens > max.promptTokens ? u : max
  );
  const modelConfig = getModelConfigByModelId(maxUsage.modelId);

  return c.json({
    model: {
      providerId: maxUsage.providerId,
      modelId: maxUsage.modelId,
    },
    contextUsage: maxUsage.promptTokens,
    contextSize: modelConfig?.contextSize ?? 0,
  });
});

export default app;
