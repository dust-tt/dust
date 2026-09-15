// Per M tokens
export type TokenPricingContent = {
  cacheCreated?: number;
  cacheHit?: number;
  standardInput: number;
  standardOutput: number;
};

export type TokenPricing =
  | [
      { upTo: number; pricing: TokenPricingContent },
      { upTo: null; pricing: TokenPricingContent },
    ]
  | [{ upTo: null; pricing: TokenPricingContent }];
