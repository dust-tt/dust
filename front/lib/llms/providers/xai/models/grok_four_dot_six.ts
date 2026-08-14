import { GROK_4_6_MODEL_CONFIG } from "@app/types/assistant/models/xai";

export function WithDustGrok46Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGrok46 extends Base {
    static readonly displayName = "Grok 4.6";
    static readonly description =
      "xAI's Grok 4.6 flagship model for coding and long-running agentic work (256k context, reasoning, vision).";
    // Dust caps usable context at 256k; the model itself supports 500k.
    static readonly contextSize = 256_000;
    // Dust caps output at 64k; xAI documents no separate text output limit.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;

    static readonly modelConfig = GROK_4_6_MODEL_CONFIG;
  }

  return DustGrok46;
}
