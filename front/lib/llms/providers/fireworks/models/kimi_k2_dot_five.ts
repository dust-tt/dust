export function WithDustMoonshotAiKimiK2Dot5Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMoonshotAiKimiK2Dot5 extends Base {
    static readonly displayName = "Kimi K2.5 (Fireworks)";
    static readonly description =
      "Moonshot AI's flagship agentic model with 262k context and vision support (served via Fireworks).";
    static readonly defaultReasoningEffort = "low";
    static readonly byok = false;
  }

  return DustMoonshotAiKimiK2Dot5;
}
