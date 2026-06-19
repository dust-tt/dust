export function WithDustMistralLargeConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralLarge extends Base {
    static readonly displayName = "Mistral Large";
    static readonly description = "Mistral's `large` model (256k context).";
    // Mistral Large is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustMistralLarge;
}
