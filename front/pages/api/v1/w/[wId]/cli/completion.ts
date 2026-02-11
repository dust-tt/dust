import type { NextApiRequest, NextApiResponse } from "next";

import { getLLM } from "@app/lib/api/llm/index";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { checkProgrammaticUsageLimits } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { apiError } from "@app/logger/withlogging";
import logger from "@app/logger/logger";
import type { WithAPIErrorResponse } from "@app/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";

const HARDCODED_MODEL_ID = "claude-sonnet-4-5-20250929";
const DEFAULT_MAX_TOKENS = 16384;
const RATE_LIMIT_MAX_PER_MINUTE = 60;

interface CLICompletionRequest {
  conversation: ModelConversationTypeMultiActions;
  tools?: AgentActionSpecification[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * Serialize an LLMEvent to an SSE-friendly JSON object.
 */
function serializeLLMEvent(
  event: LLMEvent
): Record<string, unknown> | null {
  switch (event.type) {
    case "text_delta":
      return { type: "text_delta", text: event.content.delta };
    case "reasoning_delta":
      return { type: "thinking_delta", text: event.content.delta };
    case "tool_call":
      return {
        type: "tool_use",
        id: event.content.id,
        name: event.content.name,
        input: event.content.arguments,
      };
    case "token_usage":
      return {
        type: "usage",
        input_tokens: event.content.inputTokens,
        output_tokens: event.content.outputTokens,
        cache_creation_tokens: event.content.cacheCreationTokens,
        cached_tokens: event.content.cachedTokens,
      };
    case "success":
      return {
        type: "done",
        stop_reason: event.toolCalls && event.toolCalls.length > 0
          ? "tool_use"
          : "end_turn",
      };
    case "error":
      return {
        type: "error",
        message: event.content.message,
        error_type: event.content.type,
        retryable: event.content.isRetryable,
      };
    case "interaction_id":
    case "text_generated":
    case "reasoning_generated":
      // These are aggregate/informational events; skip them in the stream.
      return null;
    default:
      return null;
  }
}

async function handler(
  req: NextApiRequest,
  // eslint-disable-next-line dust/enforce-client-types-in-public-api
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  }

  const workspace = auth.workspace();
  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  // Rate limit per workspace.
  const remaining = await rateLimiter({
    key: `cli_completion:${workspace.sId}`,
    maxPerTimeframe: RATE_LIMIT_MAX_PER_MINUTE,
    timeframeSeconds: 60,
    logger,
  });

  if (remaining === 0) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: "Rate limit exceeded. Please try again later.",
      },
    });
  }

  // Check programmatic usage limits.
  const limitsResult = await checkProgrammaticUsageLimits(auth);
  if (limitsResult.isErr()) {
    return apiError(req, res, {
      status_code: 402,
      api_error: {
        type: "plan_limit_error",
        message: limitsResult.error.message,
      },
    });
  }

  const body = req.body as CLICompletionRequest;

  if (!body.conversation?.messages || !Array.isArray(body.conversation.messages)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "conversation.messages is required and must be an array.",
      },
    });
  }

  const conversation = body.conversation;
  const specifications = body.tools ?? [];
  const systemPrompt = body.system ?? "";
  const temperature = body.temperature ?? 0;

  // Get LLM instance.
  const llm = await getLLM(auth, {
    modelId: HARDCODED_MODEL_ID,
    temperature,
    reasoningEffort: "medium",
  });

  if (!llm) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Model ${HARDCODED_MODEL_ID} is not available.`,
      },
    });
  }

  // Set up SSE streaming.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const controller = new AbortController();
  const { signal } = controller;

  req.on("close", () => {
    controller.abort();
  });

  try {
    const stream = llm.stream({
      conversation,
      prompt: systemPrompt,
      specifications,
    });

    for await (const event of stream) {
      if (signal.aborted) {
        break;
      }

      const serialized = serializeLLMEvent(event);
      if (serialized) {
        res.write(`data: ${JSON.stringify(serialized)}\n\n`);
        // @ts-expect-error - flush() needed for streaming but not in types.
        res.flush();
      }
    }
  } catch (err) {
    logger.error({ error: err }, "Error streaming CLI completion");
    res.write(
      `data: ${JSON.stringify({ type: "error", message: "Internal streaming error." })}\n\n`
    );
  }

  res.write("data: done\n\n");
  res.end();
}

export default withPublicAPIAuthentication(handler, {
  isStreaming: true,
});
