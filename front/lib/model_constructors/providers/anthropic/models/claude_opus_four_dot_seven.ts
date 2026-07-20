import { withAnthropicOpusConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { CLAUDE_OPUS_4_7 } from "@app/lib/model_constructors/types/model_ids";

export const WithAnthropicClaudeOpusFourDotSevenConfig =
  withAnthropicOpusConfig(CLAUDE_OPUS_4_7);
