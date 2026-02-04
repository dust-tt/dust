import type { z } from "zod";
import { configInputSchema, type InputConfig } from "@/types/config";

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

export const MIN_MAX_OUTPUT_TOKENS = 16;

export const DEFAULT_TEMPERATURE = 1;
export const DEFAULT_REASONING_EFFORT = "minimal";
export const DEFAULT_REASONING_DETAILS = "high";
export const DEFAULT_VERBOSITY = "medium";

export const GPT_5_2_2025_12_11_CONFIG_SCHEMA = configInputSchema;

type _Gpt5220251211Config = z.infer<typeof GPT_5_2_2025_12_11_CONFIG_SCHEMA>;

export type Gpt5220251211Config = _Gpt5220251211Config extends InputConfig
  ? _Gpt5220251211Config
  : never;
