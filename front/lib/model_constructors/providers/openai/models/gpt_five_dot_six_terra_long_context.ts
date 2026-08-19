import { GPT_5_6_TERRA_CONFIG_SCHEMA } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_terra";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import {
  GPT_5_6_TERRA,
  GPT_5_6_TERRA_LONG_CONTEXT,
} from "@app/lib/model_constructors/types/models";

import type { z } from "zod";

// Verified 2026-08-19: https://developers.openai.com/api/docs/models/gpt-5.6-terra
const CONTEXT_SIZE = 1_050_000;
const MAX_OUTPUT_TOKENS = 128_000;

export function WithOpenAIGptFiveDotSixTerraLongContextConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotSixTerraLongContext extends Base {
    // Keep a distinct Dust model ID while sending the provider's model ID.
    static readonly model = GPT_5_6_TERRA_LONG_CONTEXT;
    static readonly providerModel = GPT_5_6_TERRA;

    static readonly configSchema: z.ZodType<InputConfig> =
      GPT_5_6_TERRA_CONFIG_SCHEMA;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveDotSixTerraLongContext;
}
