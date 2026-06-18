import type { BatchEndpoint } from "@app/lib/model_constructors/batch/endpoint";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";

export type BatchModelConfiguration = BaseEndpointConfiguration;

export type BatchEndpointConstructor = (new (
  credentials: Credentials
) => BatchEndpoint) &
  BatchModelConfiguration;
