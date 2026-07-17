import { withAnthropicOpusConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { CLAUDE_OPUS_4_6_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

// Opus 4.6 does not support the `xhigh` reasoning effort (introduced in 4.7).
export const WithAnthropicClaudeOpusFourDotSixConfig = withAnthropicOpusConfig(
  CLAUDE_OPUS_4_6_MODEL_ID,
  ["low", "medium", "high", "maximal"]
);
