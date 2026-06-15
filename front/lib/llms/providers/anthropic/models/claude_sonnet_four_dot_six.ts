import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export function WithDustClaudeSonnetFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeSonnetFourDotSix extends Base {
    static readonly displayName = "Claude Sonnet 4.6";
    static readonly description =
      "Anthropic's Claude Sonnet 4.6 model, balancing power and efficiency with enhanced reasoning capabilities (200k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
    static readonly featureFlags: WhitelistableFeature[] = [];
  }

  return DustClaudeSonnetFourDotSix;
}
