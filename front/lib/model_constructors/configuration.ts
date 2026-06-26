import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { TokenPricing } from "@app/lib/model_constructors/types/token_pricing";
import type { z } from "zod";

export type BaseEndpointConfiguration<C extends InputConfig = InputConfig> = {
  // Identity
  id: `${ProviderId}/${ProviderApi}/${Region}/${ModelId}`;
  providerId: ProviderId;
  api: ProviderApi;
  modelId: ModelId;
  region: Region;

  // Capabilities
  contextSize: number;
  maxOutputTokens: number;
  // Config schemas parse loose external input (with defaults/transforms) into
  // the precise config `C`, so only the parsed output is constrained; the input
  // side stays open.
  configSchema: z.ZodType<C, z.ZodTypeDef, unknown>;

  // Pricing
  tokenPricing: TokenPricing;
};
