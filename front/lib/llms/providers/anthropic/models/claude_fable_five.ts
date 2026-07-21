import { dropTemperature } from "@app/lib/llms/stream/types/configuration";

export function WithDustClaudeFableFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeFableFive extends Base {
    static readonly displayName = "Claude Fable 5";
    static readonly description =
      "Anthropic's Claude Fable 5 model, their most intelligent model, a new tier above Opus (250k context).";
    static readonly defaultReasoningEffort = "medium";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
    // Anthropic rejects an explicit temperature for this model.
    static readonly configParsers = [dropTemperature];
  }

  return DustClaudeFableFive;
}
