import { OpenAiResponses } from "@app/lib/model_constructors/clients/openai-responses/openaiResponsesClient";
import { WithOpenAiResponsesConverter } from "@app/lib/model_constructors/clients/openai-responses/openaiResponsesConverter";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/config";
import type { Payload } from "@app/lib/model_constructors/types/messages";
import type { TokenPricing } from "@app/lib/model_constructors/types/pricing";
import {
  GPT_5_2_MODEL_ID,
  type Model,
  OPENAI_PROVIDER_ID,
} from "@app/lib/model_constructors/types/providers";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { z } from "zod";

const NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "maximal",
] as const;

const model = {
  modelId: GPT_5_2_MODEL_ID,
  providerId: OPENAI_PROVIDER_ID,
} as const satisfies Model;
const contextWindow = 400_000;
const maxOutputTokens = 128_000;
const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.enum(NON_NULL_REASONING_EFFORTS) })
      .default({ effort: "medium" }),
    // Reasoning requires temperature=1; accept any value but coerce to 1.
    temperature: temperatureSchema.optional().transform(() => 1 as const),
  }),
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.default(1),
  }),
]);
const tokenPricing = [
  {
    upTo: null,
    pricing: {
      cacheHit: 0.175,
      standardInput: 1.75,
      standardOutput: 14,
    },
  },
] satisfies TokenPricing;

// https://developers.openai.com/api/docs/models/gpt-5.2
export class OpenAiGptFiveDotTwo extends WithOpenAiResponsesConverter(
  OpenAiResponses
) {
  static readonly model = model;
  static readonly contextWindow = contextWindow;
  static readonly maxOutputTokens = maxOutputTokens;
  static readonly configSchema = configSchema;
  static readonly tokenPricing = tokenPricing;

  model = OpenAiGptFiveDotTwo.model;
  contextWindow = OpenAiGptFiveDotTwo.contextWindow;
  maxOutputTokens = OpenAiGptFiveDotTwo.maxOutputTokens;
  configSchema = OpenAiGptFiveDotTwo.configSchema;
  tokenPricing = OpenAiGptFiveDotTwo.tokenPricing;

  buildRequestPayload(
    { conversation }: Payload,
    {
      tools = [],
      temperature,
      reasoning,
      cacheKey,
      forceTool,
      outputFormat,
    }: z.infer<typeof this.configSchema>
  ): ResponseCreateParamsStreaming {
    const cacheKeyObject = cacheKey ? { prompt_cache_key: cacheKey } : {};
    const responseFormatObject = outputFormat
      ? { text: { format: this.outputFormatToResponseFormat(outputFormat) } }
      : {};
    const input = this.conversationToResponseInput(conversation);

    const payload: ResponseCreateParamsStreaming = {
      model: this.model.modelId,
      input,
      temperature: temperature ?? null,
      reasoning: this.toReasoning(reasoning),
      tools: tools.map(this.toolToFunctionTool),
      include: ["reasoning.encrypted_content"],
      tool_choice: this.forceTooltoToolChoice(tools, forceTool),
      stream: true,
      ...responseFormatObject,
      ...cacheKeyObject,
    };

    return payload;
  }
}
