import type { MessageCreateParamsStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
  Anthropic,
} from "@app/lib/api/models/clients/anthropic/anthropicClient";
import { WithAnthropicConverter } from "@app/lib/api/models/clients/anthropic/anthropicConverter";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/api/models/types/config";
import type { Payload } from "@app/lib/api/models/types/messages";
import type { TokenPricing } from "@app/lib/api/models/types/pricing";
import {
  ANTHROPIC_PROVIDER_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  type Model,
} from "@app/lib/api/models/types/providers";
import merge from "lodash/merge";
import { z } from "zod";

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.undefined(),
});
const model = {
  modelId: CLAUDE_SONNET_4_6_MODEL_ID,
  providerId: ANTHROPIC_PROVIDER_ID,
} as const satisfies Model;
const contextWindow = 1_000_000;
const maxOutputTokens = 64_000;
const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
      })
      .default({ effort: "high" }),
    temperature: z.literal(1).optional().default(1),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional().default(1),
  }),
]);
// https://platform.claude.com/docs/en/about-claude/pricing
const tokenPricing = [
  {
    upTo: null,
    pricing: {
      cacheCreated: 3.75,
      cacheHit: 0.3,
      standardInput: 3.0,
      standardOutput: 15.0,
    },
  },
] satisfies TokenPricing;

// https://www.anthropic.com/claude/sonnet
export class AnthropicClaudeSonnetFourDotSix extends WithAnthropicConverter(
  Anthropic
) {
  static readonly model = model;
  static readonly contextWindow = contextWindow;
  static readonly maxOutputTokens = maxOutputTokens;
  static readonly configSchema = configSchema;
  static readonly tokenPricing = tokenPricing;

  model = AnthropicClaudeSonnetFourDotSix.model;
  contextWindow = AnthropicClaudeSonnetFourDotSix.contextWindow;
  maxOutputTokens = AnthropicClaudeSonnetFourDotSix.maxOutputTokens;
  configSchema = AnthropicClaudeSonnetFourDotSix.configSchema;
  tokenPricing = AnthropicClaudeSonnetFourDotSix.tokenPricing;

  buildRequestPayload(
    { conversation }: Payload,
    {
      tools = [],
      temperature,
      reasoning,
      forceTool,
      outputFormat,
    }: z.infer<typeof this.configSchema>
  ): MessageCreateParamsStreaming {
    const outputFormatObject = outputFormat
      ? this.outputFormatToOutputConfig(outputFormat)
      : { output_config: undefined };
    const adaptiveReasoningObject = this.reasoningToThinkingConfig(reasoning);

    return {
      model: this.model.modelId,
      max_tokens: this.maxOutputTokens,
      messages: this.conversationToMessages(conversation),
      system: this.systemMessagesToSystemParam(conversation.system),
      ...(temperature ? { temperature } : {}),
      thinking: adaptiveReasoningObject.thinking,
      output_config: merge(
        outputFormatObject.output_config ?? {},
        adaptiveReasoningObject.output_config ?? {}
      ),
      tools: tools.map(this.toolSpecToAnthropicTool),
      tool_choice: this.forceToolNameToToolChoice(tools, forceTool),
      stream: true,
    };
  }
}
