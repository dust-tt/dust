import type { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { TokenPricing } from "@app/lib/model_constructors/types/token_pricing";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { z } from "zod";

// The cross-surface-common static contract: the identity and capability fields
// every model carries regardless of inference surface (stream / batch /
// image generation). Each surface defines its OWN configuration type by
// intersecting this base with the surface-specific bits — most notably
// `configSchema`, whose shape differs per surface (text input vs. image input).
//
// The per-model shared values for these fields are injected once by a model
// helper mixin (e.g. `WithAnthropicClaudeSonnetFourDotSixConfig`) so every
// surface leaf stays in sync by construction.
export type BaseModelConfiguration = {
  // Identity
  id: `${ProviderId}::${ProviderApi}::${Region}::${ModelId}`;
  providerId: ProviderId;
  api: ProviderApi;
  modelId: ModelId;
  region: Region;

  // Description
  displayName: string;
  description: string;

  // Capabilities
  contextSize: number;
  maxOutputTokens: number;
  defaultReasoningEffort: ReasoningEffort;
  configSchema: z.ZodType<z.infer<typeof inputConfigSchema>>;

  // Filters
  byok: boolean;
  featureFlags: WhitelistableFeature[];

  // Pricing
  tokenPricing: TokenPricing;
};
