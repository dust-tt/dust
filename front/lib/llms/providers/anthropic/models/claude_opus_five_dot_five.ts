import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeOpusFiveDotFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFiveDotFive extends Base {
    static readonly displayName = "Claude Opus 5.5";
    static readonly description =
      "Anthropic's Claude Opus 5.5 model, the latest and most capable model for complex agentic coding and enterprise work (250k context).";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
    // Anthropic rejects an explicit temperature for this model. No
    // `disableReasoningWhenForcingTool` unlike Opus 5: Opus 5.5 rejects a
    // forced `tool_choice` outright, so there is no reasoning setting that
    // would make one work.
    static readonly configParsers = [dropTemperature];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = CLAUDE_OPUS_5_5_DEFAULT_MODEL_CONFIG;
  }

  return DustClaudeOpusFiveDotFive;
}
