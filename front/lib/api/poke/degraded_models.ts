import { DUST_STREAM_ENDPOINTS } from "@app/lib/llms/stream";
import type {
  DegradedModelEndpointType,
  DegradedModelEndpointUpdateType,
} from "@app/lib/model_constructors/types/degradations";
import { degradedModelEndpointKey } from "@app/lib/model_constructors/types/degradations";
import { NOOP_HOST } from "@app/lib/model_constructors/types/hosts";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

type DegradableModelEndpointType = DegradedModelEndpointType & {
  displayName: string;
};

export type DegradedModelEndpointStatusType = DegradableModelEndpointType & {
  degraded: boolean;
};

export type GetDegradedModelsResponseBody = {
  endpoints: DegradedModelEndpointStatusType[];
};

export const UpdateDegradedModelsSchema = z.object({
  endpoints: z.array(
    z.object({
      modelId: z.string(),
      providerId: z.string(),
      host: z.string(),
      degraded: z.boolean(),
    })
  ),
});

export function listDegradableEndpoints(): DegradableModelEndpointType[] {
  const byKey = new Map<string, DegradableModelEndpointType>();

  for (const endpoint of Object.values(DUST_STREAM_ENDPOINTS)) {
    if (endpoint.host === NOOP_HOST) {
      continue;
    }

    const degradable = {
      modelId: endpoint.modelConfig.modelId,
      providerId: endpoint.modelConfig.providerId,
      host: endpoint.host,
      displayName: endpoint.displayName,
    };

    byKey.set(degradedModelEndpointKey(degradable), degradable);
  }

  return [...byKey.values()];
}

export async function listDegradableEndpointsWithStatus(): Promise<
  DegradedModelEndpointStatusType[]
> {
  const degradedKeys = new Set(
    (await ModelDegradationResource.listDegradedEndpoints()).map(
      degradedModelEndpointKey
    )
  );

  return listDegradableEndpoints().map((endpoint) => ({
    ...endpoint,
    degraded: degradedKeys.has(degradedModelEndpointKey(endpoint)),
  }));
}

// Endpoints come off the wire as plain strings: matching them against the
// catalog recovers their narrow types, and rejects the request if any is unknown.
export function resolveDegradedEndpointUpdates(
  requested: {
    modelId: string;
    providerId: string;
    host: string;
    degraded: boolean;
  }[]
): Result<DegradedModelEndpointUpdateType[], Error> {
  const degradableByKey = new Map(
    listDegradableEndpoints().map(({ displayName: _, ...endpoint }) => [
      degradedModelEndpointKey(endpoint),
      endpoint,
    ])
  );

  const resolvedByKey = new Map<string, DegradedModelEndpointUpdateType>();
  const unknownKeys: string[] = [];

  for (const { degraded, ...requestedEndpoint } of requested) {
    const key = degradedModelEndpointKey(requestedEndpoint);
    const endpoint = degradableByKey.get(key);
    if (endpoint) {
      resolvedByKey.set(key, { ...endpoint, degraded });
    } else {
      unknownKeys.push(key);
    }
  }

  if (unknownKeys.length > 0) {
    return new Err(
      new Error(`unknown model endpoints: ${unknownKeys.join(", ")}`)
    );
  }

  return new Ok([...resolvedByKey.values()]);
}
