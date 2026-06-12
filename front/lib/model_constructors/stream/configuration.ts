import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";
import type { z } from "zod";

export type StreamModelConfiguration = BaseModelConfiguration & {
  configSchema: z.ZodType<z.infer<typeof inputConfigSchema>>;
  supportedReasoningEfforts: ReasoningEffort[];
};

export type StreamEndpointConstructor = (new (
  credentials: Credentials
) => StreamEndpoint<any, any>) &
  StreamModelConfiguration;
