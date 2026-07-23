import { FIREWORKS_KIMI_K2P6_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustMoonshotAiKimiK2Dot6Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustMoonshotAiKimiK2Dot6Config extends Base {}
  const WithConfig = Object.assign(
    DustMoonshotAiKimiK2Dot6Config,
    FIREWORKS_KIMI_K2P6_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustMoonshotAiKimiK2Dot6 extends WithConfig {
    static readonly displayName = "Kimi K2.6 (Fireworks)";
    static readonly description =
      "Moonshot AI's flagship agentic model with 262k context and vision support (served via Fireworks).";
    static readonly byok = false;
  }

  return DustMoonshotAiKimiK2Dot6;
}
