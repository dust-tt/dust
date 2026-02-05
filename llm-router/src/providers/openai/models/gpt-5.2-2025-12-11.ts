import type { ResponseCreateParamsBase } from "openai/resources/responses/responses";
import {
  configInputSchema,
  maxOutputTokensSchema,
  temperatureSchema,
  topLogprobsSchema,
  topProbabilitySchema,
} from "@/types/config";
import { OpenAIModel } from "@/providers/openai/model";
import { z } from "zod";

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

// export const GPT_5_2_2025_12_11_CONFIG_SCHEMA = z.object({
//   temperature: temperatureSchema.default(DEFAULT_TEMPERATURE),
//   maxOutputTokens: maxOutputTokensSchema
//     .min(MIN_MAX_OUTPUT_TOKENS)
//     .nullable()
//     .default(DEFAULT_MAX_OUTPUT_TOKENS),
//   reasoningEffort: z.enum(REASONING_EFFORTS).default(DEFAULT_REASONING_EFFORT),
//   reasoningDetailsLevel: z
//     .enum(REASONING_DETAILS_LEVELS)
//     .default(DEFAULT_REASONING_DETAILS),
//   topProbability: topProbabilitySchema.default(DEFAULT_TOP_PROBABILITY),
//   topLogprobs: topLogprobsSchema
//     .max(MAX_TOP_LOGPROBS)
//     .default(DEFAULT_TOP_LOGPROBS),
// });

// export type Gpt5220251211Config = z.infer<
//   typeof GPT_5_2_2025_12_11_CONFIG_SCHEMA
// >;

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

export class GPT_5_2_2025_12_11 extends OpenAIModel {
  protected configSchema = configInputSchema.extend({
    temperature: temperatureSchema.default(DEFAULT_TEMPERATURE),
    maxOutputTokens: maxOutputTokensSchema
      .min(MIN_MAX_OUTPUT_TOKENS)
      .nullable()
      .default(DEFAULT_MAX_OUTPUT_TOKENS),
    reasoningEffort: z
      .enum(REASONING_EFFORTS)
      .default(DEFAULT_REASONING_EFFORT),
    reasoningDetailsLevel: z
      .enum(REASONING_DETAILS_LEVELS)
      .default(DEFAULT_REASONING_DETAILS),
    topProbability: topProbabilitySchema.default(DEFAULT_TOP_PROBABILITY),
    topLogprobs: topLogprobsSchema
      .max(MAX_TOP_LOGPROBS)
      .default(DEFAULT_TOP_LOGPROBS),
  });

  constructor() {
    super(GPT_5_2_2025_12_11_MODEL_ID);
  }

  toConfig(
    config: z.infer<typeof this.configSchema>
  ): Pick<
    ResponseCreateParamsBase,
    "max_output_tokens" | "reasoning" | "temperature" | "top_p"
  > {
    return {
      max_output_tokens: config.maxOutputTokens,
      reasoning: {
        effort: reasoningEffortMapping[config.reasoningEffort],
        summary: reasoningDetailsLevelMapping[config.reasoningDetailsLevel],
      },
      temperature: config.temperature,
      top_p: config.topProbability,
    } as const;
  }
}
