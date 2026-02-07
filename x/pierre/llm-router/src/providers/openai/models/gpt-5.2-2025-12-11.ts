import type { ResponseCreateParamsBase } from "openai/resources/responses/responses";
import { z } from "zod";

import { OpenAIModel } from "@/providers/openai/model";
import {
  configInputSchema,
  maxOutputTokensSchema,
  temperatureSchema,
  toolSchema,
  topLogprobsSchema,
  topProbabilitySchema,
} from "@/types/config";

export const GPT_5_2_2025_12_11_MODEL_ID = "gpt-5.2-2025-12-11" as const;

// "frequency_penalty": 0,
// "max_output_tokens": null,
// "max_tool_calls": null,
// "parallel_tool_calls": true,
// "presence_penalty": 0,
// "previous_response_id": null,
// "prompt_cache_key": null,
// "prompt_cache_retention": null,
// "reasoning": {
//   "effort": "none",  Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh
//   "summary": "detailed"
// },
// "safety_identifier": null,
// "service_tier": "auto",
// "store": false,
// "temperature": 1,
// "text": {
//   "format": {
//     "type": "text"
//   },
//   "verbosity": "medium"
// },
// "tool_choice": "auto",
// "tools": [],
// "top_logprobs": 0, max 20
// "top_p": 0.98,
// "truncation": "disabled",

// min_max_output_tokens: 16
// temperature, top_p, and logprobs only if reasoning effort is "none" (or undefined)

const MIN_MAX_OUTPUT_TOKENS = 16;
const DEFAULT_MAX_OUTPUT_TOKENS = null;
const REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "very_high",
] as const;
const REASONING_DETAILS_LEVELS = ["low", "high"] as const;

const DEFAULT_TEMPERATURE = 1;
const DEFAULT_REASONING_EFFORT = "none";
const DEFAULT_REASONING_DETAILS = "high";
export const DEFAULT_VERBOSITY = "medium";
const DEFAULT_TOP_PROBABILITY = 0.98;
const MAX_TOP_LOGPROBS = 20;
const DEFAULT_TOP_LOGPROBS = 0;

const reasoningEffortMapping = {
  none: "none",
  very_low: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  very_high: "xhigh",
} as const;

const reasoningDetailsLevelMapping = {
  low: "concise",
  high: "detailed",
} as const;

export class GptFiveDotTwoV20251211 extends OpenAIModel {
  static override modelId = GPT_5_2_2025_12_11_MODEL_ID;
  static override configSchema = configInputSchema
    .extend({
      temperature: temperatureSchema.optional().default(DEFAULT_TEMPERATURE),
      maxOutputTokens: maxOutputTokensSchema
        .min(MIN_MAX_OUTPUT_TOKENS)
        .nullable()
        .optional()
        .default(DEFAULT_MAX_OUTPUT_TOKENS),
      reasoningEffort: z
        .enum(REASONING_EFFORTS)
        .optional()
        .default(DEFAULT_REASONING_EFFORT),
      reasoningDetailsLevel: z
        .enum(REASONING_DETAILS_LEVELS)
        .optional()
        .default(DEFAULT_REASONING_DETAILS),
      topProbability: topProbabilitySchema
        .optional()
        .default(DEFAULT_TOP_PROBABILITY),
      topLogprobs: topLogprobsSchema
        .max(MAX_TOP_LOGPROBS)
        .optional()
        .default(DEFAULT_TOP_LOGPROBS),
      tools: z.array(toolSchema).optional().default([]),
    })
    .refine(
      (data) => {
        // temperature, top_p, and logprobs only allowed if reasoning effort is "none" or undefined
        if (
          data.reasoningEffort !== "none" &&
          data.reasoningEffort !== undefined
        ) {
          const hasNonDefaultTemperature =
            data.temperature !== undefined &&
            data.temperature !== DEFAULT_TEMPERATURE;
          const hasNonDefaultTopProbability =
            data.topProbability !== undefined &&
            data.topProbability !== DEFAULT_TOP_PROBABILITY;
          const hasNonDefaultTopLogprobs =
            data.topLogprobs !== undefined &&
            data.topLogprobs !== DEFAULT_TOP_LOGPROBS;

          if (
            hasNonDefaultTemperature ||
            hasNonDefaultTopProbability ||
            hasNonDefaultTopLogprobs
          ) {
            return false;
          }
        }
        return true;
      },
      {
        message:
          'Temperature, topProbability, and topLogprobs can not be set when reasoningEffort value is different from "none".',
      }
    );

  toConfig(
    config: z.input<typeof GptFiveDotTwoV20251211.configSchema>
  ): Pick<
    ResponseCreateParamsBase,
    "max_output_tokens" | "reasoning" | "temperature" | "top_p" | "tools"
  > {
    const filledDefaults = GptFiveDotTwoV20251211.configSchema.parse(config);

    return {
      max_output_tokens: filledDefaults.maxOutputTokens,
      reasoning: {
        effort: reasoningEffortMapping[filledDefaults.reasoningEffort],
        summary:
          reasoningDetailsLevelMapping[filledDefaults.reasoningDetailsLevel],
      },
      temperature: filledDefaults.temperature,
      top_p: filledDefaults.topProbability,
      tools: filledDefaults.tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        strict: true,
      })),
    };
  }
}
