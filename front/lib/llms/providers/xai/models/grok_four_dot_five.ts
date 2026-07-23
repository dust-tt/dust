import { GROK_4_5_MODEL_CONFIG } from "@app/types/assistant/models/xai";

export function WithDustGrok45Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGrok45Config extends Base {}
  const WithConfig = Object.assign(DustGrok45Config, GROK_4_5_MODEL_CONFIG);

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGrok45 extends WithConfig {
    static readonly displayName = "Grok 4.5";
    static readonly description =
      "xAI's Grok 4.5 flagship model (500k context, reasoning, vision).";
    static readonly defaultReasoningEffort = "high";
    static readonly byok = false;
  }

  return DustGrok45;
}
