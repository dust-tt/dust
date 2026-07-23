import { FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustDeepSeekDeepSeekV4ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustDeepSeekDeepSeekV4ProConfig extends Base {}
  const WithConfig = Object.assign(
    DustDeepSeekDeepSeekV4ProConfig,
    FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustDeepSeekDeepSeekV4Pro extends WithConfig {
    static readonly displayName = "DeepSeek V4 Pro (Fireworks)";
    static readonly description =
      "DeepSeek's V4 Pro Mixture-of-Experts model with frontier reasoning, advanced coding, and 1M context (served via Fireworks).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = false;
  }

  return DustDeepSeekDeepSeekV4Pro;
}
