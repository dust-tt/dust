import { dropTemperature } from "@app/lib/llms/stream/types/configuration";

export function WithDustGptFiveDotOneConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotOne extends Base {
    static readonly displayName = "GPT-5.1";
    static readonly description =
      "OpenAI's GPT-5.1 reasoning model (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature for this model.
    static readonly parseConfig = dropTemperature;
  }

  return DustGptFiveDotOne;
}
