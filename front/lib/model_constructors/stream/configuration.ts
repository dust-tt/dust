import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";

export type StreamModelConfiguration = BaseModelConfiguration & {
  supportedReasoningEfforts: ReasoningEffort[];
};

export type StreamEndpointConstructor = (new (
  credentials: Credentials
) => StreamEndpoint<any, any>) &
  StreamModelConfiguration;
