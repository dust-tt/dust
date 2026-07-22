export function WithDustGrok45Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGrok45 extends Base {
    static readonly displayName = "Grok 4.5";
    static readonly description =
      "xAI's Grok 4.5 flagship model (500k context, reasoning, vision).";
    static readonly defaultReasoningEffort = "high";
    static readonly byok = false;
  }

  return DustGrok45;
}
