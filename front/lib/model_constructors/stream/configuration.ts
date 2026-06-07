import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";
import type { z } from "zod";

// The stream surface's own static configuration contract: the cross-surface
// identity/capability fields plus the surface-specific bits. `configSchema` is
// supplied per leaf (it can differ per surface), and `supportedReasoningEfforts`
// is the inherited `ModelClient` static computed from it.
export type StreamModelConfiguration = BaseModelConfiguration & {
  configSchema: z.ZodType<z.infer<typeof inputConfigSchema>>;
  supportedReasoningEfforts: ReasoningEffort[];
};

// The static-side contract every concrete streaming model class must satisfy: a
// constructable class that also carries the configuration fields. This is as
// close as TypeScript gets to `abstract static` — enforced at the registration
// boundary (the `STREAM_MODELS` registry), not on the class declaration.
//
// `StreamEndpoint<any, any>`: the registry is heterogeneous (each provider pins
// `I`/`O` to its own SDK types) and `I` appears contravariantly in `streamRaw`,
// so a concrete `StreamEndpoint<Msg, Event>` is not assignable to
// `StreamEndpoint<unknown, unknown>`. `any` is the existential that lets the bag
// hold any concrete endpoint regardless of its `I`/`O`.
export type StreamEndpointConstructor = (new (
  credentials: Credentials
) => StreamEndpoint<any, any>) &
  StreamModelConfiguration;
