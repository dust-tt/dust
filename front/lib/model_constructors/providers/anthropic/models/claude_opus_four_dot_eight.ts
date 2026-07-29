import { withAnthropicOpusConfig } from "@app/lib/model_constructors/providers/anthropic/models/claude_opus_four_shared_config";
import { CLAUDE_OPUS_4_8 } from "@app/lib/model_constructors/types/models";

export const WithAnthropicClaudeOpusFourDotEightConfig =
  withAnthropicOpusConfig(CLAUDE_OPUS_4_8);
