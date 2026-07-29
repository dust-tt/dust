import {
  disableReasoningWhenForcingTool,
  dropTemperature,
} from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeOpusFourDotEightConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotEight extends Base {
    static readonly displayName = "Claude Opus 4.8";
    static readonly description =
      "Anthropic's Claude Opus 4.8 model, the latest and most capable model with stronger agentic coding, reasoning, and judgement (250k context).";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
    // Anthropic rejects an explicit temperature for this model.
    static readonly configParsers = [
      disableReasoningWhenForcingTool,
      dropTemperature,
    ];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG;
  }

  return DustClaudeOpusFourDotEight;
}
