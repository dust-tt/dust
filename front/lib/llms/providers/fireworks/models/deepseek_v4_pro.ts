export function WithDustDeepSeekDeepSeekV4ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustDeepSeekDeepSeekV4Pro extends Base {
    static readonly displayName = "DeepSeek V4 Pro (Fireworks)";
    static readonly description =
      "DeepSeek's V4 Pro Mixture-of-Experts model with frontier reasoning, advanced coding, and 1M context (served via Fireworks).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = false;
  }

  return DustDeepSeekDeepSeekV4Pro;
}
