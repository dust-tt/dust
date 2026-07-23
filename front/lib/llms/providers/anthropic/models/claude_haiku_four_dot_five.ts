import {
  disableReasoningWhenForcingTool,
  dropTemperatureWhenReasoning,
} from "@app/lib/llms/stream/types/configuration";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export function WithDustClaudeHaikuFourDotFive<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustClaudeHaikuFourDotFiveConfig extends Base {}
  const WithConfig = Object.assign(
    DustClaudeHaikuFourDotFiveConfig,
    CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustClaudeHaikuFourDotFive extends WithConfig {
    static readonly displayName = "Claude 4.5 Haiku";
    static readonly description =
      "Anthropic's Claude 4.5 Haiku model, cost effective and high throughput (200k context).";
    static readonly byok = true;
    // Anthropic rejects a non-default temperature while thinking is active (drop
    // it → schema re-applies the required 1), and rejects temperature=1 while
    // thinking is disabled.
    static readonly configParsers = [
      disableReasoningWhenForcingTool,
      dropTemperatureWhenReasoning,
    ];
  }

  return DustClaudeHaikuFourDotFive;
}
