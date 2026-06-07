import type { BatchEndpoint } from "@app/lib/model_constructors/batch/endpoint";
import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { z } from "zod";

// The batch surface's own static configuration contract, mirroring
// `StreamModelConfiguration`. `configSchema` is supplied per leaf (the batch and
// stream leaves of a model happen to share it today, but the surface owns the
// field so they can diverge).
export type BatchModelConfiguration = BaseModelConfiguration & {
  configSchema: z.ZodType<z.infer<typeof inputConfigSchema>>;
};

// Static-side contract for concrete batch model classes, mirroring
// `StreamEndpointConstructor` but for the batch hierarchy.
export type BatchEndpointConstructor = (new (
  credentials: Credentials
) => BatchEndpoint<any, any>) &
  BatchModelConfiguration;
