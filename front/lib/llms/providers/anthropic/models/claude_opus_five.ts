import {
  disableReasoningWhenForcingTool,
  dropTemperature,
} from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeOpusFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustClaudeOpusFiveConfig extends Base {}
  const WithConfig = Object.assign(
    DustClaudeOpusFiveConfig,
    CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustClaudeOpusFive extends WithConfig {
    static readonly displayName = "Claude Opus 5";
    static readonly description =
      "Anthropic's Claude Opus 5 model, the latest and most capable model for complex agentic coding and enterprise work (250k context).";
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

  return DustClaudeOpusFive;
}
