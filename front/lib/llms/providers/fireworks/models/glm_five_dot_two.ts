import { FIREWORKS_GLM_5P2_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustZAiGlm52Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustZAiGlm52Config extends Base {}
  const WithConfig = Object.assign(
    DustZAiGlm52Config,
    FIREWORKS_GLM_5P2_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustZAiGlm52 extends WithConfig {
    static readonly displayName = "GLM-5.2 (Fireworks)";
    static readonly description =
      "Z.ai's GLM-5.2 Mixture-of-Experts model with advanced coding and long-horizon agentic capabilities (1M context, served via Fireworks).";
    static readonly byok = false;
  }

  return DustZAiGlm52;
}
