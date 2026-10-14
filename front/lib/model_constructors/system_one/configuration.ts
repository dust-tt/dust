import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { SystemOneEndpoint } from "@app/lib/model_constructors/system_one/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";

// Decision endpoints take no sampling configuration and generate no output, so
// they carry identity and pricing only.
export type SystemOneModelConfiguration = Pick<
  BaseEndpointConfiguration,
  "id" | "lab" | "host" | "model" | "region" | "tokenPricing"
>;

export type SystemOneEndpointConstructor = (new (
  credentials: Credentials
) => SystemOneEndpoint) &
  SystemOneModelConfiguration;
