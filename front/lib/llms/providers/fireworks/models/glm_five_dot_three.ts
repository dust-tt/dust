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
      "Z.ai's GLM-5.3 Mixture-of-Experts model with advanced coding and long-horizon agentic capabilities (1M context, served via Fireworks).";
    // Matches the exposed context of its predecessor GLM-5.2; the model itself
    // supports 1,048,576.
    static readonly contextSize = 1_000_000;
    // Dust caps output at 64k; the model itself supports 131,072.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;

    static readonly modelConfig = FIREWORKS_GLM_5P3_MODEL_CONFIG;

    // GLM-5.3 has no `medium`: fold Dust's light/medium/high ladder onto its
    // native low/high/max efforts.
    static readonly configParsers = [mapReasoningEffortToLowHighMax];
  }

  return DustZAiGlm53;
}
