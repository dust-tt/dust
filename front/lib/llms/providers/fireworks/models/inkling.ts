import { FIREWORKS_INKLING_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustThinkingMachinesInklingConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustThinkingMachinesInkling extends Base {
    static readonly displayName = "Inkling (Fireworks)";
    static readonly description =
      "Thinking Machines Lab's open-weights multimodal Mixture-of-Experts model with controllable reasoning and 1M context (served via Fireworks).";
    // Dust caps output at 64k; Fireworks supports up to 1M completion tokens.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;
    static readonly modelConfig = FIREWORKS_INKLING_MODEL_CONFIG;
  }

  return DustThinkingMachinesInkling;
}
