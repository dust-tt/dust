import Anthropic from "@anthropic-ai/sdk";
import type { MessageCountTokensParams } from "@anthropic-ai/sdk/resources";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";

import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import {
  ANTHROPIC_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/anthropic/types";
import {
  toAutoThinkingConfig,
  toOutputFormatParam,
  toThinkingConfig,
  toToolChoiceParam,
} from "@app/lib/api/llm/clients/anthropic/utils";
import { streamLLMEvents } from "@app/lib/api/llm/clients/anthropic/utils/anthropic_to_events";
import {
  toMessage,
  toTool,
} from "@app/lib/api/llm/clients/anthropic/utils/conversation_to_anthropic";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
  SystemPromptContext,
  SystemPromptInstruction,
} from "@app/lib/api/llm/types/options";
import { normalizePrompt } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types/api/credentials";
import type { WorkspaceType } from "@app/types/user";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

/**
 * Maps prompt sections to Anthropic system blocks.
 *
 * Each non-empty group in [instructions, context] becomes a separate system block.
 * Both currently use the default 5min cache TTL. Once we remove entropy from
 * instructions, we can use extended-cache-ttl (1h) for better cache savings.
 */
function buildSystemBlocks(
  [instructions, context]: [SystemPromptInstruction[], SystemPromptContext[]],
  { hasConditionalJITTools }: { hasConditionalJITTools?: boolean }
) {
  const instructionsText = instructions.map((s) => s.content).join("\n");
  const contextText = context.map((s) => s.content).join("\n");

  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [];
  if (instructionsText) {
    // If we have conditional JIT tools, we expect more variability in the instructions, so we keep
    // the default ephemeral cache. Otherwise, we can set a longer TTL to maximize cache hits.
    const ttl: "1h" | undefined = hasConditionalJITTools ? undefined : "1h";

    system.push({
      type: "text",
      text: instructionsText,
      cache_control: { type: "ephemeral", ttl },
    });
  }
  if (contextText) {
    system.push({
      type: "text",
      text: contextText,
      cache_control: { type: "ephemeral" },
    });
  }

  return system;
}

async function* parseSSEStream(
  body: AsyncIterable<Uint8Array>
): AsyncGenerator<BetaRawMessageStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          continue;
        }
        const event = JSON.parse(data);
        // The SDK silently filters non-message events (e.g. "ping") before
        // yielding them. We must do the same to avoid hitting assertNever.
        if (event.type === "ping") {
          continue;
        }
        yield event as BetaRawMessageStreamEvent;
      }
    }
  }
}

export class AnthropicLLM extends LLM<BetaMessageStreamParams> {
  private client: Anthropic;
  private apiKey: string;
  private workspace: WorkspaceType;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & { modelId: AnthropicWhitelistedModelId }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, ANTHROPIC_PROVIDER_ID, params);
    const { ANTHROPIC_API_KEY } = dustManagedCredentials();
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "DUST_MANAGED_ANTHROPIC_API_KEY environment variable is required"
      );
    }

    this.apiKey = ANTHROPIC_API_KEY;
    this.client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    this.workspace = auth.getNonNullableWorkspace();
  }

  protected buildRequestPayload({
    conversation,
    hasConditionalJITTools,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): BetaMessageStreamParams {
    const messages = conversation.messages.map((msg, index, array) =>
      toMessage(msg, { isLast: index === array.length - 1 })
    );

    // Build thinking config, use custom type if specified.
    const thinkingConfig =
      this.modelConfig.customThinkingType === "auto"
        ? toAutoThinkingConfig(
            this.reasoningEffort,
            this.modelConfig.useNativeLightReasoning
          )
        : toThinkingConfig(
            this.reasoningEffort,
            this.modelConfig.useNativeLightReasoning
          );

    // Merge betas, always include structured-outputs, add custom betas if specified.
    // TODO(fabien): Remove beta tag and beta client when structured outputs are generally available.
    const betas = [
      "structured-outputs-2025-11-13",
      ...(this.modelConfig.customBetas ?? []),
    ];

    const system = buildSystemBlocks(normalizePrompt(prompt), {
      hasConditionalJITTools,
    });

    return {
      model: this.modelId,
      ...thinkingConfig,
      system,
      messages,
      temperature: this.temperature ?? undefined,
      stream: true,
      tools: specifications.map(toTool),
      max_tokens: this.modelConfig.generationTokensCount,
      tool_choice: toToolChoiceParam(specifications, forceToolCall),
      betas,
      output_format: toOutputFormatParam(this.responseFormat),
      cache_control: { type: "ephemeral" },
    };
  }

  protected async *sendRequest(
    payload: BetaMessageStreamParams
  ): AsyncGenerator<LLMEvent> {
    try {
      const { betas, ...body } = payload;

      const response = await untrustedFetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          "content-type": "application/json",
          ...(betas?.length ? { "anthropic-beta": betas.join(",") } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message =
          (errorBody as { error?: { message?: string } })?.error?.message ??
          `HTTP ${response.status}`;
        logger.error(
          { status: response.status, errorBody },
          "AnthropicLLM: HTTP error from Anthropic API"
        );
        throw Object.assign(new Error(message), { status: response.status });
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const shouldCountReasoningTokens =
        this.reasoningEffort !== "none" &&
        (this.reasoningEffort !== "light" ||
          !!this.modelConfig.useNativeLightReasoning);

      const countTokens = shouldCountReasoningTokens
        ? (body: MessageCountTokensParams) =>
            this.client.messages.countTokens(body)
        : undefined;

      yield* streamLLMEvents(
        parseSSEStream(response.body),
        this.metadata,
        countTokens
      );
    } catch (err) {
      logger.error({ err }, "AnthropicLLM: sendRequest error");
      yield handleGenericError(err, this.metadata);
    }
  }
}
