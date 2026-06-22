import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import {
  type AnthropicOpusInputConfig,
  OPUS_CONTEXT_SIZE,
  OPUS_MAX_OUTPUT_TOKENS,
  opusConfigSchema,
} from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { CLAUDE_OPUS_4_7_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import type { z } from "zod";

export function WithAnthropicClaudeOpusFourDotSevenConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeOpusFourDotSeven extends Base {
    // Narrow `Client`'s `["constructor"]` to this model's precise config so the
    // instance type carries the Opus config (not the wide `InputConfig`).
    declare ["constructor"]: BaseEndpointConfiguration<AnthropicOpusInputConfig>;

    static readonly modelId = CLAUDE_OPUS_4_7_MODEL_ID;

    static readonly configSchema: z.ZodType<
      AnthropicOpusInputConfig,
      z.ZodTypeDef,
      unknown
    > = opusConfigSchema;

    static readonly contextSize = OPUS_CONTEXT_SIZE;
    static readonly maxOutputTokens = OPUS_MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeOpusFourDotSeven;
}
