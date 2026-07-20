import type { Host } from "@app/lib/model_constructors/types/hosts";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Lab } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { TokenPricing } from "@app/lib/model_constructors/types/token_pricing";
import type { z } from "zod";

export type BaseEndpointConfiguration<C extends InputConfig = InputConfig> = {
  // Identity
  id: `${Lab}/${Model}/${Region}/${Host}`;
  lab: Lab;
  host: Host;
  model: Model;
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
