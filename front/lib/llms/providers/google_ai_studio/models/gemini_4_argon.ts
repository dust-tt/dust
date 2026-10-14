import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { GEMINI_4_ARGON_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleGeminiFourArgonConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class DustGoogleGeminiFourArgon extends Base {
    static readonly displayName = "Gemini 4 Argon";
    static readonly description =
      "Google's flagship reasoning model for complex and agentic tasks (1m context).";
    static readonly byok = true;

    static readonly modelConfig = GEMINI_4_ARGON_MODEL_CONFIG;

    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/4-argon
    // (2026-10-13): Custom temperature, top_p, and top_k values are ignored.
    static readonly configParsers = [dropTemperature];
  }

  return DustGoogleGeminiFourArgon;
}
