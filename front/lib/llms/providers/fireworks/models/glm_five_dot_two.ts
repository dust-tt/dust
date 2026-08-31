import { FIREWORKS_GLM_5P2_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustZAiGlm52Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustZAiGlm52 extends Base {
    static readonly displayName = "GLM-5.2";
    static readonly description =
      "Z.ai's GLM-5.2 Mixture-of-Experts model with advanced coding and long-horizon agentic capabilities (1M context, served via Fireworks).";
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_GLM_5P2_MODEL_CONFIG;
  }

  return DustZAiGlm52;
}
