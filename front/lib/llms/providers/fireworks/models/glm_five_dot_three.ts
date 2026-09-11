import { mapReasoningEffortToLowHighMax } from "@app/lib/llms/stream/types/configuration";
import { FIREWORKS_GLM_5P3_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustZAiGlm53Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustZAiGlm53 extends Base {
    static readonly displayName = "GLM-5.3";
    static readonly description =
      "Z.ai's flagship GLM-5.3 Mixture-of-Experts model with advanced coding and long-horizon agentic capabilities (1M context, served via Fireworks).";
    // Rounded down from the model's native 1,048,576 / 131,072.
    static readonly contextSize = 1_000_000;
    static readonly maxOutputTokens = 128_000;
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_GLM_5P3_MODEL_CONFIG;

    // GLM-5.3 has no `medium`: fold Dust's light/medium/high ladder onto its
    // native low/high/max efforts.
    static readonly configParsers = [mapReasoningEffortToLowHighMax];
  }

  return DustZAiGlm53;
}
