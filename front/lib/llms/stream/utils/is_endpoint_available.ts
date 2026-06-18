import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import { matchesWhere } from "@app/lib/llms/utils/matches_where";

export function isEndpointAvailable(
  endpointConstructor: DustStreamEndpointConstructor,
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  // Availability is decided by matching a `where` condition from both sides:
  //
  // - The input condition (`inputCondition`): the filter the caller wants to retrieve, evaluated
  //   against the endpoint's own properties. It expresses what the call site is looking for — e.g.
  //   a workspace-level constraint, whitelisting some provider ids, or simply the code base
  //   requiring a specific modelId.
  //
  // - The endpoint condition (`endpoint.constructor.endpointFilter`): the filter the endpoint
  //   declares about which workspaces it is available to, evaluated against the workspace
  //   configuration we receive. This side is fixed by the endpoint and is not tweakable at runtime.
  //
  // The endpoint is available only when both conditions match.
  return (
    matchesWhere(endpointConstructor, inputCondition) &&
    matchesWhere(workspaceConfiguration, endpointConstructor.endpointFilter)
  );
}
