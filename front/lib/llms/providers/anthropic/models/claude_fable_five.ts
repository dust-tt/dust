import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeFableFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustClaudeFableFiveConfig extends Base {}
  const WithConfig = Object.assign(
    DustClaudeFableFiveConfig,
    CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustClaudeFableFive extends WithConfig {
    static readonly displayName = "Claude Fable 5";
    static readonly description =
      "Anthropic's Claude Fable 5 model, their most intelligent model, a new tier above Opus (250k context).";
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
