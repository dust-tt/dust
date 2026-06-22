import { makeAnthropicOpusConfigMixin } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { CLAUDE_OPUS_4_6_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

export const WithAnthropicClaudeOpusFourDotSixConfig =
  makeAnthropicOpusConfigMixin(CLAUDE_OPUS_4_6_MODEL_ID);
