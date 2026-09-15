import type { Reasoning } from "openai/resources";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { z } from "zod";

import { OpenAiResponses } from "@/clients/openai-responses/openaiResponses";
import { inputConfigSchema, temperatureSchema } from "@/types/config";
import type { Payload } from "@/types/messages";
import type { TokenPricing } from "@/types/pricing";
import {
  GPT_5_2_MODEL_ID,
  type Model,
  OPENAI_PROVIDER_ID,
} from "@/types/providers";

const model: Model = {
  modelId: GPT_5_2_MODEL_ID,
  providerId: OPENAI_PROVIDER_ID,
};
const contextWindow = 400_000;
const maxOutputTokens = 128_000;
const NON_NULL_REASONING_EFFORTS = ["low", "medium", "high", "maximal"] as const;

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.string().optional(),
});
const configSchema = z.union([
  baseConfig.extend({
    reasoning: z.object({ effort: z.enum(NON_NULL_REASONING_EFFORTS) }).default({ effort: "medium" }) ,
    temperature: z.literal(1).optional(),
  }),
  baseConfig.extend({
    reasoning: z
      .object({ effort: z.literal("none") }),
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
export class OpenAiGptFiveDotTwo extends OpenAiResponses {
  model = model;
  contextWindow = contextWindow;
  maxOutputTokens = maxOutputTokens;
  configSchema = configSchema;
  tokenPricing = tokenPricing;

  toReasoning(
    reasoning: z.infer<typeof this.configSchema>["reasoning"]
  ): Reasoning {
    return {
      effort: reasoning.effort === "maximal" ? "xhigh" : reasoning.effort,
      summary: "auto",
    };
  }

  getSupportedReasoningEfforts(): z.infer<
    typeof this.configSchema
  >["reasoning"]["effort"][] {
    return ["none", ...NON_NULL_REASONING_EFFORTS];
  }

  buildRequestPayload(
    { conversation }: Payload,
    {
      tools = [],
      temperature,
      reasoning,
      cacheKey,
      forceTool,
    }: z.infer<typeof this.configSchema>
  ): ResponseCreateParamsStreaming {
    const cacheKeyObject = cacheKey ? { prompt_cache_key: cacheKey } : {};
    const input = this.conversationToResponseInput(conversation);

    const payload: ResponseCreateParamsStreaming = {
      model: this.modelId,
      input,
      temperature: temperature ?? null,
      reasoning: this.toReasoning(reasoning),
      tools: tools.map(this.toolToFunctionTool),
      include: ["reasoning.encrypted_content"],
      tool_choice: this.forceTooltoToolChoice(tools, forceTool),
      stream: true,
      ...cacheKeyObject,
    };

    return payload;
  }

  async *streamRaw(
    input: ResponseCreateParamsStreaming
  ): AsyncGenerator<ResponseStreamEvent> {
    yield* await this.client.responses.create(input);
  }
}
