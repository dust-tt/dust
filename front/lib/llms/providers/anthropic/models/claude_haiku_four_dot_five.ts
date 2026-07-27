import {
  disableReasoningWhenForcingTool,
  dropTemperatureWhenReasoning,
} from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeHaikuFourDotFive<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeHaikuFourDotFive extends Base {
    static readonly displayName = "Claude 4.5 Haiku";
    static readonly description =
      "Anthropic's Claude 4.5 Haiku model, cost effective and high throughput (200k context).";
    static readonly byok = true;
    // Anthropic rejects a non-default temperature while thinking is active (drop
    // it → schema re-applies the required 1), and rejects temperature=1 while
    // thinking is disabled.
    static readonly configParsers = [
      disableReasoningWhenForcingTool,
      dropTemperatureWhenReasoning,
    ];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }

  return DustClaudeHaikuFourDotFive;
}
