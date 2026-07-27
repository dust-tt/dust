import { legacyModelIdToModel } from "@app/lib/api/llm";
import { getStreamEndpoints } from "@app/lib/llms/stream";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";

// Test-only: resolve a stream endpoint for a model id without any workspace
// routing, using permissive filters. Throws if the model has no endpoint.
export function getTestStreamEndpoint(
  modelId: string
): DustStreamEndpointConstructor {
  const routerModel = legacyModelIdToModel(modelId);
  const endpoint = routerModel
    ? getStreamEndpoints(
        { featureFlags: [], isEnterprise: true, isCreditPriced: false },
        { model: { eq: routerModel } }
      )[0]
    : undefined;
  if (!endpoint) {
    throw new Error(`No stream endpoint found for model ${modelId}`);
  }
  return endpoint;
}
