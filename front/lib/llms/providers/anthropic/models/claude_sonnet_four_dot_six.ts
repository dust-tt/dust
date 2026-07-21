import {
  dropTemperatureOfOneWhenReasoningIsNone,
  dropTemperatureWhenReasoning,
} from "@app/lib/llms/stream/types/configuration";

export function WithDustClaudeSonnetFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeSonnetFourDotSix extends Base {
    static readonly displayName = "Claude Sonnet 4.6";
    static readonly description =
      "Anthropic's Claude Sonnet 4.6 model, balancing power and efficiency with enhanced reasoning capabilities (250k context).";
    static readonly defaultReasoningEffort = "medium";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
    // Anthropic rejects a non-default temperature while thinking is active (drop
    // it → schema re-applies the required 1), and rejects temperature=1 while
    // thinking is disabled.
    static readonly configParsers = [
      dropTemperatureWhenReasoning,
      dropTemperatureOfOneWhenReasoningIsNone,
    ];
  }

  return DustClaudeSonnetFourDotSix;
}
