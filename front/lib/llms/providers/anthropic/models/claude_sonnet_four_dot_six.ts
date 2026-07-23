import {
  disableReasoningWhenForcingTool,
  dropTemperatureWhenReasoning,
} from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeSonnetFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustClaudeSonnetFourDotSixConfig extends Base {}
  const WithConfig = Object.assign(
    DustClaudeSonnetFourDotSixConfig,
    CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustClaudeSonnetFourDotSix extends WithConfig {
    static readonly displayName = "Claude Sonnet 4.6";
    static readonly description =
      "Anthropic's Claude Sonnet 4.6 model, balancing power and efficiency with enhanced reasoning capabilities (250k context).";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
    // Anthropic rejects a non-default temperature while thinking is active (drop
    // it → schema re-applies the required 1), and rejects temperature=1 while
    // thinking is disabled.
    static readonly configParsers = [
      disableReasoningWhenForcingTool,
      dropTemperatureWhenReasoning,
    ];
  }

  return DustClaudeSonnetFourDotSix;
}
