import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";

export function WithDustGptFiveDotSixLunaConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotSixLuna extends Base {
    static readonly displayName = "GPT-5.6 Luna";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-5.6 model for high-volume workloads (272k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly parseConfig = dropTemperatureWhenReasoning;
  }

  return DustGptFiveDotSixLuna;
}
