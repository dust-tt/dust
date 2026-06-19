export function WithDustMistralSmallConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralSmall extends Base {
    static readonly displayName = "Mistral Small";
    static readonly description = "Mistral's `small` model (128k context).";
    // Mistral Small is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustMistralSmall;
}
