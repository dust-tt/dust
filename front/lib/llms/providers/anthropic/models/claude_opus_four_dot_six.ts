import {
  disableReasoningWhenForcingTool,
  dropTemperatureWhenReasoning,
} from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeOpusFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotSix extends Base {
    static readonly displayName = "Claude Opus 4.6";
    static readonly description =
      "Anthropic's Claude Opus 4.6 model, an advanced model with enhanced reasoning capabilities (250k context).";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
    // Opus 4.6 accepts a caller-supplied temperature, but Anthropic rejects
    // temperature=1 while thinking is disabled; drop it in that case only.
    static readonly configParsers = [
      disableReasoningWhenForcingTool,
      dropTemperatureWhenReasoning,
    ];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG;
  }

  return DustClaudeOpusFourDotSix;
}
