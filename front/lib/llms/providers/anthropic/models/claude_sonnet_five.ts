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
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustClaudeSonnetFiveConfig extends Base {}
  const WithConfig = Object.assign(
    DustClaudeSonnetFiveConfig,
    CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustClaudeSonnetFive extends WithConfig {
    static readonly displayName = "Claude Sonnet 5";
    static readonly description =
      "Anthropic's Claude Sonnet 5 model, reaching near-Opus quality on coding and agentic work while balancing power and efficiency (250k context).";
    static readonly defaultReasoningEffort = "medium";
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
  }

  return DustClaudeSonnetFive;
}
