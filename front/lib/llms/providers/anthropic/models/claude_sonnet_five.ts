import {
  disableReasoningWhenForcingTool,
  dropTemperature,
} from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeSonnetFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeSonnetFive extends Base {
    static readonly displayName = "Claude Sonnet 5";
    static readonly description =
      "Anthropic's Claude Sonnet 5 model, reaching near-Opus quality on coding and agentic work while balancing power and efficiency (250k context).";
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
    static readonly modelConfig = CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG;
  }

  return DustClaudeSonnetFive;
}
