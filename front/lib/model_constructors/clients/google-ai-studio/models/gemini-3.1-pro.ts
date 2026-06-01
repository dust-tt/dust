import {
  GoogleAiStudio,
  type GoogleAiStudioRequestPayload,
} from "@app/lib/model_constructors/clients/google-ai-studio/googleAiStudioClient";
import { WithGoogleAiStudioConverter } from "@app/lib/model_constructors/clients/google-ai-studio/googleAiStudioConverter";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/config";
import type { Payload } from "@app/lib/model_constructors/types/messages";
import {
  GEMINI_3_1_PRO_MODEL_ID,
  GOOGLE_AI_STUDIO_API,
  GOOGLE_AI_STUDIO_PROVIDER_ID,
} from "@app/lib/model_constructors/types/model-endpoints";
import type { TokenPricing } from "@app/lib/model_constructors/types/pricing";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import { z } from "zod";

const SUPPORTED_NON_NULL_REASONING_EFFORTS = ["low", "medium", "high"] as const;

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.undefined(),
});
const modelEndpoint = {
  modelId: GEMINI_3_1_PRO_MODEL_ID,
  providerId: GOOGLE_AI_STUDIO_PROVIDER_ID,
  region: GLOBAL,
  api: GOOGLE_AI_STUDIO_API,
} as const;
const contextWindow = 1_000_000;
const maxOutputTokens = 64_000;
const configSchema = baseConfig.extend({
  reasoning: z
    .object({
      effort: z.enum(SUPPORTED_NON_NULL_REASONING_EFFORTS),
    })
    .default({ effort: "high" }),
  // Google strongly recommends temperature=1 for Gemini 3 models; accept any
  // value but coerce to 1.
  temperature: temperatureSchema.optional().transform(() => 1 as const),
});
// https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-pro
const tokenPricing = [
  {
    upTo: 200_000,
    pricing: {
      standardInput: 2.0,
      standardOutput: 12.0,
    },
  },
  {
    upTo: null,
    pricing: {
      standardInput: 4.0,
      standardOutput: 18.0,
    },
  },
] satisfies TokenPricing;

// https://ai.google.dev/gemini-api/docs/models/gemini#gemini-3.1-pro
export class GeminiThreeDotOnePro extends WithGoogleAiStudioConverter(
  GoogleAiStudio
) {
  static readonly modelEndpoint = modelEndpoint;
  static readonly contextWindow = contextWindow;
  static readonly maxOutputTokens = maxOutputTokens;
  static readonly configSchema = configSchema;
  static readonly tokenPricing = tokenPricing;

  modelEndpoint = GeminiThreeDotOnePro.modelEndpoint;
  contextWindow = GeminiThreeDotOnePro.contextWindow;
  maxOutputTokens = GeminiThreeDotOnePro.maxOutputTokens;
  configSchema = GeminiThreeDotOnePro.configSchema;
  tokenPricing = GeminiThreeDotOnePro.tokenPricing;

  buildRequestPayload(
    { conversation }: Payload,
    {
      tools = [],
      temperature,
      reasoning,
      forceTool,
      outputFormat,
    }: z.infer<typeof this.configSchema>
  ): GoogleAiStudioRequestPayload {
    const responseSchemaObject = outputFormat
      ? this.outputFormatToResponseSchema(outputFormat)
      : {};

    return {
      model: this.modelEndpoint.modelId,
      conversation,
      generationConfig: {
        temperature,
        candidateCount: 1,
        maxOutputTokens: this.maxOutputTokens,
        systemInstruction: this.systemMessagesToSystemInstruction(
          conversation.system
        ),
        thinkingConfig: this.reasoningToThinkingConfig(reasoning),
        tools: this.toolSpecsToTools(tools),
        toolConfig: this.forceToolNameToToolConfig(tools, forceTool),
        ...responseSchemaObject,
      },
    };
  }
}
