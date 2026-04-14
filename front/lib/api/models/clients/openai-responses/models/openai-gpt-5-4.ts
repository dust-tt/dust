import { OpenAiResponses } from "@app/lib/api/models/clients/openai-responses/openaiResponsesClient";
import { WithOpenAiResponsesConverter } from "@app/lib/api/models/clients/openai-responses/openaiResponsesConverter";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/api/models/types/config";
import type { Payload } from "@app/lib/api/models/types/messages";
import type { TokenPricing } from "@app/lib/api/models/types/pricing";
import {
  GPT_5_4_MODEL_ID,
  type Model,
  OPENAI_PROVIDER_ID,
} from "@app/lib/api/models/types/providers";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { z } from "zod";

const NON_NULL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "maximal",
] as const;

const model = {
  modelId: GPT_5_4_MODEL_ID,
  providerId: OPENAI_PROVIDER_ID,
} as const satisfies Model;
const contextWindow = 1_050_000;
const maxOutputTokens = 128_000;
const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.enum(NON_NULL_REASONING_EFFORTS) }),
    temperature: z.literal(1).optional(),
  }),
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.literal("none") })
      .default({ effort: "none" }),
    temperature: temperatureSchema.default(1),
  }),
]);
const tokenPricing = [
  {
    upTo: null,
    pricing: {
      cacheHit: 0.25,
      standardInput: 2.5,
      standardOutput: 15,
    },
  },
] satisfies TokenPricing;

// https://developers.openai.com/api/docs/models/gpt-5.4
export class OpenAiGptFiveDotFour extends WithOpenAiResponsesConverter(
  OpenAiResponses
) {
  static readonly model = model;
  static readonly contextWindow = contextWindow;
  static readonly maxOutputTokens = maxOutputTokens;
  static readonly configSchema = configSchema;
  static readonly tokenPricing = tokenPricing;

  model = OpenAiGptFiveDotFour.model;
  contextWindow = OpenAiGptFiveDotFour.contextWindow;
  maxOutputTokens = OpenAiGptFiveDotFour.maxOutputTokens;
  configSchema = OpenAiGptFiveDotFour.configSchema;
  tokenPricing = OpenAiGptFiveDotFour.tokenPricing;

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
