import config from "@app/lib/api/config";
import type { BaseMessage } from "@app/lib/model_constructors/types/input/messages";
import type { CompressionUsage } from "@app/lib/resources/run_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CompressResult, OpenAIMessage } from "headroom-ai";
import { compress } from "headroom-ai";

// The headroom-ai SDK is a thin client over the local compression proxy; give it
// a bounded budget so a slow/unavailable proxy can never stall a model request.
const HEADROOM_TIMEOUT_MS = 15_000;

// Attribution slug surfaced in the headroom proxy telemetry/stats.
const HEADROOM_STACK = "dust_llm_router";

// Datadog metric namespace for headroom compression telemetry.
const HEADROOM_METRIC_PREFIX = "headroom_compression";

type CompressionOutcome = "applied" | "skipped" | "error";

// Emit compression telemetry to Datadog, mirroring what we log. Tagged by model
// id (bounded cardinality) and outcome; workspace id is intentionally kept to
// logs only to avoid exploding metric tag cardinality. Token counts and ratio
// go out as distributions so percentiles aggregate correctly across app servers.
function recordCompressionMetrics(
  modelId: string,
  outcome: CompressionOutcome,
  result?: CompressResult
): void {
  const client = getStatsDClient();
  const tags = [`model_id:${modelId}`, `outcome:${outcome}`];

  client.increment(`${HEADROOM_METRIC_PREFIX}.count`, 1, tags);

  if (result) {
    client.distribution(
      `${HEADROOM_METRIC_PREFIX}.tokens_before`,
      result.tokensBefore,
      tags
    );
    client.distribution(
      `${HEADROOM_METRIC_PREFIX}.tokens_after`,
      result.tokensAfter,
      tags
    );
    client.distribution(
      `${HEADROOM_METRIC_PREFIX}.tokens_saved`,
      result.tokensSaved,
      tags
    );
    client.distribution(
      `${HEADROOM_METRIC_PREFIX}.ratio`,
      result.compressionRatio,
      tags
    );
  }
}

// Emit the per-agent-loop compression rollup (summed across every LLM call in
// the loop) to Datadog. Called once when the agentic loop finalizes; no-ops when
// the loop had no compression. Untagged by model on purpose — a loop is a single
// aggregate and may span more than one model.
export function recordLoopCompressionMetrics({
  inputTokens,
  savedTokens,
}: CompressionUsage): void {
  if (inputTokens <= 0) {
    return;
  }

  const client = getStatsDClient();
  client.distribution(
    `${HEADROOM_METRIC_PREFIX}.loop.tokens_before`,
    inputTokens
  );
  client.distribution(
    `${HEADROOM_METRIC_PREFIX}.loop.tokens_saved`,
    savedTokens
  );
  client.distribution(
    `${HEADROOM_METRIC_PREFIX}.loop.ratio`,
    savedTokens / inputTokens
  );
}

// Maps Dust internal model ids to the model names headroom-ai / LiteLLM expect
// (keys in model_prices_and_context_window.json). Only ids that differ from a
// bare LiteLLM key are listed; OpenAI, Anthropic, Google, and DeepSeek ids
// already match a bare key and pass through unchanged via `toHeadroomModelId`.
//
// LiteLLM namespaces these providers with a prefix. The legacy Claude 3.5 ids
// (`claude-3-5-sonnet-*`, `claude-3-5-haiku-20241022`), `o1-mini`, and the
// internal `noop` model have no distinct bare LiteLLM key, so they intentionally
// fall through to headroom's default tokenizer.
const DUST_TO_LITELLM_MODEL_ID: Record<string, string> = {
  // Mistral — LiteLLM `mistral/` prefix.
  "mistral-large-latest": "mistral/mistral-large-latest",
  "mistral-medium": "mistral/mistral-medium",
  // No dated 3.5 key in LiteLLM; use the generic latest medium for tokenization.
  "mistral-medium-3-5": "mistral/mistral-medium-latest",
  "mistral-small-latest": "mistral/mistral-small-latest",
  "codestral-latest": "mistral/codestral-latest",

  // xAI Grok — LiteLLM `xai/` prefix. The v4 `*-fast-*` ids drop `-latest`.
  "grok-3-latest": "xai/grok-3-latest",
  "grok-3-mini-latest": "xai/grok-3-mini-latest",
  "grok-4-latest": "xai/grok-4-latest",
  "grok-4-fast-reasoning-latest": "xai/grok-4-fast-reasoning",
  "grok-4-fast-non-reasoning-latest": "xai/grok-4-fast-non-reasoning",
  "grok-4-1-fast-reasoning-latest": "xai/grok-4-1-fast-reasoning-latest",
  "grok-4-1-fast-non-reasoning-latest":
    "xai/grok-4-1-fast-non-reasoning-latest",

  // TogetherAI — LiteLLM `together_ai/` prefix.
  "meta-llama/Llama-3.3-70B-Instruct-Turbo":
    "together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "Qwen/Qwen2.5-Coder-32B-Instruct":
    "together_ai/Qwen/Qwen2.5-Coder-32B-Instruct",
  "Qwen/QwQ-32B-Preview": "together_ai/Qwen/QwQ-32B-Preview",
  "Qwen/Qwen2-72B-Instruct": "together_ai/Qwen/Qwen2-72B-Instruct",
  "deepseek-ai/DeepSeek-V3": "together_ai/deepseek-ai/DeepSeek-V3",

  // Fireworks — LiteLLM `fireworks_ai/` prefix.
  "accounts/fireworks/models/deepseek-v3p2":
    "fireworks_ai/accounts/fireworks/models/deepseek-v3p2",
  "accounts/fireworks/models/deepseek-v4-pro":
    "fireworks_ai/accounts/fireworks/models/deepseek-v4-pro",
  "accounts/fireworks/models/glm-5":
    "fireworks_ai/accounts/fireworks/models/glm-5",
  "accounts/fireworks/models/glm-5p2":
    "fireworks_ai/accounts/fireworks/models/glm-5p2",
  "accounts/fireworks/models/kimi-k2-instruct-0905":
    "fireworks_ai/accounts/fireworks/models/kimi-k2-instruct-0905",
  "accounts/fireworks/models/kimi-k2p5":
    "fireworks_ai/accounts/fireworks/models/kimi-k2p5",
  "accounts/fireworks/models/minimax-m2p5":
    "fireworks_ai/accounts/fireworks/models/minimax-m2p5",
};

// Translate a Dust model id to the name headroom-ai / LiteLLM expects. Unmapped
// ids (which already match a bare LiteLLM key, plus custom/future models) are
// returned unchanged so headroom can resolve them or fall back gracefully.
export function toHeadroomModelId(modelId: string): string {
  return DUST_TO_LITELLM_MODEL_ID[modelId] ?? modelId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRole(value: unknown): string | null {
  if (isRecord(value) && typeof value.role === "string") {
    return value.role;
  }
  return null;
}

// We only ever rewrite plain-string message content. Structured content (image
// parts, tool calls) comes back as arrays/objects and is left untouched.
function readStringContent(value: unknown): string | null {
  if (isRecord(value) && typeof value.content === "string") {
    return value.content;
  }
  return null;
}

// Project a Dust `BaseMessage` onto the OpenAI message shape that the proxy
// understands. This is a faithful 1:1 mapping: every message in, every message
// out, preserving role family so the compressed result can be realigned by
// index.
function baseMessageToOpenAI(message: BaseMessage): OpenAIMessage {
  switch (message.role) {
    case "user":
      switch (message.type) {
        case "text":
          return { role: "user", content: message.content.value };
        case "image_url":
          return {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: message.content.url } },
            ],
          };
        case "tool_call_result": {
          const texts: string[] = [];
          for (const part of message.content.parts) {
            if (part.type === "text") {
              texts.push(part.text);
            }
          }
          return {
            role: "tool",
            tool_call_id: message.content.callId,
            content: texts.join("\n"),
          };
        }
        default:
          return assertNever(message);
      }
    case "assistant":
      switch (message.type) {
        case "text":
        case "reasoning":
          return { role: "assistant", content: message.content.value };
        case "tool_call_request":
          return {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: message.content.callId,
                type: "function",
                function: {
                  name: message.content.toolName,
                  arguments: message.content.arguments,
                },
              },
            ],
          };
        default:
          return assertNever(message);
      }
    default:
      return assertNever(message);
  }
}

// Write compressed text back into the original message, returning a NEW message
// (never mutating the input). Only text-bearing, safe-to-rewrite content is
// updated; reasoning signatures, tool-call arguments, images, and call IDs are
// preserved exactly so tool-calling and prompt caching keep working.
function applyCompressedText(original: BaseMessage, text: string): BaseMessage {
  switch (original.role) {
    case "user":
      switch (original.type) {
        case "text":
          return { ...original, content: { value: text } };
        case "image_url":
          return original;
        case "tool_call_result": {
          // Only collapse when every part is text; mixed/image parts are kept
          // as-is to avoid dropping non-text content.
          const allText = original.content.parts.every(
            (part) => part.type === "text"
          );
          if (!allText) {
            return original;
          }
          return {
            ...original,
            content: {
              ...original.content,
              parts: [{ type: "text", text }],
            },
          };
        }
        default:
          return assertNever(original);
      }
    case "assistant":
      switch (original.type) {
        case "text":
          return { ...original, content: { value: text } };
        case "reasoning":
        case "tool_call_request":
          return original;
        default:
          return assertNever(original);
      }
    default:
      return assertNever(original);
  }
}

interface CompressConversationOptions {
  modelId: string;
  workspaceId: string;
}

/**
 * Compress conversation messages through the local headroom-ai proxy.
 *
 * Safety contract: this is best-effort and never throws. The compressed result
 * is applied only when it comes back as a strict 1:1, role-aligned array; if the
 * proxy is down, errors, or drops/merges turns (rolling window / intelligent
 * context), the original messages are returned unchanged. The system prompt is
 * never passed here — only the conversation turns.
 */
export async function compressConversationMessages(
  messages: BaseMessage[],
  { modelId, workspaceId }: CompressConversationOptions
): Promise<{ messages: BaseMessage[]; usage: CompressionUsage | null }> {
  if (messages.length === 0) {
    return { messages, usage: null };
  }

  const openAIMessages = messages.map(baseMessageToOpenAI);

  try {
    // `compress` is an external library boundary, so catching here is expected.
    const result = await compress(openAIMessages, {
      model: toHeadroomModelId(modelId),
      baseUrl: config.getHeadroomProxyUrl(),
      timeout: HEADROOM_TIMEOUT_MS,
      // On any proxy error the client returns the original messages untouched.
      fallback: true,
      stack: HEADROOM_STACK,
    });

    const compressed = result.messages;

    if (
      !result.compressed ||
      !Array.isArray(compressed) ||
      compressed.length !== openAIMessages.length
    ) {
      logger.info(
        {
          workspaceId,
          modelId,
          compressed: result.compressed,
          inputCount: openAIMessages.length,
          returnedCount: Array.isArray(compressed) ? compressed.length : null,
        },
        "[headroom] Skipping compression: result is not a 1:1 message array."
      );
      recordCompressionMetrics(modelId, "skipped");
      return { messages, usage: null };
    }

    const rewritten = messages.map((message, i) => {
      const compressedMessage = compressed[i];
      // Realign by role; bail on this message if the proxy reshaped it.
      if (readRole(compressedMessage) !== openAIMessages[i].role) {
        return message;
      }
      const text = readStringContent(compressedMessage);
      if (text === null) {
        return message;
      }
      return applyCompressedText(message, text);
    });

    logger.info(
      {
        workspaceId,
        modelId,
        tokensBefore: result.tokensBefore,
        tokensAfter: result.tokensAfter,
        tokensSaved: result.tokensSaved,
        compressionRatio: result.compressionRatio,
        transformsApplied: result.transformsApplied,
      },
      "[headroom] Compressed conversation messages."
    );
    recordCompressionMetrics(modelId, "applied", result);

    return {
      messages: rewritten,
      usage: {
        inputTokens: result.tokensBefore,
        savedTokens: result.tokensSaved,
      },
    };
  } catch (err) {
    logger.error(
      { workspaceId, modelId, err: normalizeError(err) },
      "[headroom] Compression failed; using uncompressed messages."
    );
    recordCompressionMetrics(modelId, "error");
    return { messages, usage: null };
  }
}
